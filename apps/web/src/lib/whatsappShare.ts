import { buildWhatsappLink } from '@surani/shared';

/**
 * Share a message on WhatsApp with its emoji intact.
 *
 * Passing the text through the wa.me link encodes correctly and survives a round trip, but
 * WhatsApp Desktop on Windows mangles characters outside the basic range on the way in — and every
 * emoji is such a character. They arrive as "�". So the text goes on the clipboard and the chat
 * opens empty: pasting never passes through a URL, and nothing is lost.
 *
 * The copy is done synchronously with execCommand rather than navigator.clipboard. The modern API
 * is a promise, needs a secure context and can be refused when the document loses focus — all of
 * which make it unreliable at the exact moment a new tab is being opened. execCommand is
 * deprecated but works inside a click handler without permissions, which is what matters here.
 */

/**
 * Copies text, preferring the supported clipboard API and falling back to the old command.
 * Returns false only if both were refused.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      // This promise only resolves once the write has actually happened.
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* refused — fall back below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Kept on-screen but invisible: an element with display:none cannot be selected.
    Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0' });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function shareOnWhatsapp(phone: string | null | undefined, message: string): Promise<void> {
  window.open(await prepareWhatsappShare(phone, message), '_blank');
}

/**
 * Copies the message and returns the chat link, for callers that already hold a window open
 * (opening one later would be treated as a pop-up and blocked).
 */
export async function prepareWhatsappShare(phone: string | null | undefined, message: string): Promise<string> {
  if (!message) {
    notice(false, 'There was no message to copy — the template may be empty.');
    return buildWhatsappLink(phone, '');
  }
  const copied = await copyText(message);
  notice(copied);
  // Chat opened empty when the text is safely on the clipboard, ready to paste.
  return buildWhatsappLink(phone, copied ? '' : message);
}

/**
 * A note that stays until dismissed.
 *
 * It cannot be a brief toast: opening WhatsApp switches away from this tab immediately, so
 * anything that times out is gone before it can be read. This waits on the page for the user to
 * come back.
 */
function notice(copied: boolean, override?: string): void {
  document.getElementById('wa-share-note')?.remove();

  const el = document.createElement('div');
  el.id = 'wa-share-note';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: '28px',
    transform: 'translateX(-50%)',
    background: copied ? '#0f766e' : '#b45309',
    color: '#fff',
    padding: '12px 18px',
    borderRadius: '10px',
    fontSize: '13.5px',
    fontWeight: '600',
    boxShadow: '0 6px 20px rgba(15,23,42,.28)',
    zIndex: '3000',
    maxWidth: '90vw',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    cursor: 'pointer',
  } as CSSStyleDeclaration);

  const text = document.createElement('span');
  text.textContent =
    override ??
    (copied
      ? 'Message copied — press Ctrl + V in the WhatsApp chat, then send'
      : 'Could not copy — check the message in WhatsApp before sending');
  const close = document.createElement('span');
  close.textContent = '✕';
  close.style.opacity = '0.8';

  el.append(text, close);
  el.onclick = () => el.remove();
  document.body.appendChild(el);
}
