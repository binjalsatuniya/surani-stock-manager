import { buildWhatsappLink } from '@surani/shared';

/**
 * Share a message on WhatsApp with its emoji intact.
 *
 * Passing the text through the wa.me link looks correct — it is percent-encoded properly and
 * survives a round trip — but WhatsApp Desktop on Windows mangles characters outside the basic
 * range on the way in, and every emoji is such a character. They arrive as "�".
 *
 * So the text is put on the clipboard and the chat is opened empty: pasting goes straight into
 * WhatsApp without passing through a URL, and nothing is lost. One extra keystroke buys a message
 * that is always right.
 *
 * If the clipboard is unavailable the old behaviour is used, so a share never simply fails.
 */
export async function shareOnWhatsapp(phone: string | null | undefined, message: string): Promise<void> {
  window.open(await prepareWhatsappShare(phone, message), '_blank');
}

/**
 * Copies the message and returns the chat link, for callers that already hold a window open
 * (opening one later would be blocked as a pop-up).
 */
export async function prepareWhatsappShare(phone: string | null | undefined, message: string): Promise<string> {
  if (!message) return buildWhatsappLink(phone, '');
  const copied = await copyText(message);
  toast(
    copied
      ? 'Message copied — press Ctrl + V in WhatsApp, then send'
      : 'Could not copy automatically — check the message before sending'
  );
  // Chat opened empty when the text is safely on the clipboard, ready to paste.
  return buildWhatsappLink(phone, copied ? '' : message);
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the older method below */
  }
  // The modern API needs a secure context, which the packaged desktop app does not always give.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Brief on-screen note, so it is obvious the message is waiting on the clipboard. */
function toast(text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '28px',
    transform: 'translateX(-50%)',
    background: '#0f766e',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 6px 20px rgba(15,23,42,.25)',
    zIndex: '3000',
    maxWidth: '90vw',
    textAlign: 'center',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
