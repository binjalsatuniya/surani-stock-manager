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
  return shareViaWindow(null, phone, message);
}

/**
 * Whether this is a phone/tablet browser. On mobile, wa.me pre-fills the message text correctly in
 * the WhatsApp app, so we send it straight through instead of the desktop copy-to-clipboard dance
 * (which only exists because WhatsApp Desktop on Windows mangles emoji passed in the URL).
 */
function isMobileWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|Windows Phone|Mobile/i.test(ua)) return true;
  // iPadOS 13+ reports a desktop Safari UA but is really a touch device.
  if (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1) return true;
  return false;
}

/**
 * Last-resort share: the message on screen, already selected, with the chat one click away.
 * Nothing here depends on clipboard permission — worst case the user presses Ctrl+C themselves.
 */
function manualCopyPanel(phone: string | null | undefined, message: string): void {
  document.getElementById('wa-manual')?.remove();

  const back = document.createElement('div');
  back.id = 'wa-manual';
  Object.assign(back.style, {
    position: 'fixed', inset: '0', background: 'rgba(15,23,42,.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: '3000', padding: '20px',
  } as CSSStyleDeclaration);

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff', borderRadius: '12px', padding: '18px 20px', width: '560px',
    maxWidth: '92vw', boxShadow: '0 12px 40px rgba(15,23,42,.3)', fontFamily: 'inherit',
  } as CSSStyleDeclaration);

  const title = document.createElement('div');
  title.textContent = 'Copy the message, then send it in WhatsApp';
  Object.assign(title.style, { fontWeight: '700', fontSize: '15px', marginBottom: '4px' } as CSSStyleDeclaration);

  const hint = document.createElement('div');
  hint.textContent =
    'Your browser blocked automatic copying. The text below is selected — press Ctrl + C, then open WhatsApp and press Ctrl + V.';
  Object.assign(hint.style, { fontSize: '12.5px', color: '#475569', marginBottom: '10px' } as CSSStyleDeclaration);

  const ta = document.createElement('textarea');
  ta.value = message;
  ta.readOnly = true;
  Object.assign(ta.style, {
    width: '100%', height: '220px', fontSize: '13px', fontFamily: 'inherit',
    border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', resize: 'vertical',
  } as CSSStyleDeclaration);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' } as CSSStyleDeclaration);

  const btn = (label: string, primary: boolean) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
      border: primary ? 'none' : '1px solid #cbd5e1',
      background: primary ? '#0f766e' : '#fff', color: primary ? '#fff' : '#0b1220',
    } as CSSStyleDeclaration);
    return b;
  };

  const selectBtn = btn('Select all again', false);
  selectBtn.onclick = () => { ta.focus(); ta.select(); };

  const openBtn = btn('Open WhatsApp', true);
  openBtn.onclick = () => {
    back.remove();
    window.open(buildWhatsappLink(phone, ''), '_blank');
  };

  const closeBtn = btn('Cancel', false);
  closeBtn.onclick = () => back.remove();

  row.append(selectBtn, closeBtn, openBtn);
  card.append(title, hint, ta, row);
  back.appendChild(card);
  document.body.appendChild(back);

  // Pre-select so Ctrl+C works straight away.
  ta.focus();
  ta.select();
}

/**
 * Share through a window the caller already opened (opening one later would be treated as a
 * pop-up and blocked). Behaves like shareOnWhatsapp: automatic copy when the browser allows it,
 * otherwise the manual panel — the pre-opened window is closed so it isn't left blank on screen.
 */
export async function shareViaWindow(
  win: Window | null,
  phone: string | null | undefined,
  message: string
): Promise<void> {
  if (!message) {
    win?.close();
    notice(false, 'There was no message to share — the template may be empty.');
    return;
  }
  // Phone browser: hand the whole message to WhatsApp directly (it pre-fills it, ready to send).
  if (isMobileWeb()) {
    const link = buildWhatsappLink(phone, message);
    if (win) win.location.href = link;
    else window.open(link, '_blank');
    return;
  }
  const copied = await copyText(message);
  if (!copied) {
    // The panel carries its own "Open WhatsApp" button, so this blank tab is no longer wanted.
    win?.close();
    manualCopyPanel(phone, message);
    return;
  }
  notice(true);
  const link = buildWhatsappLink(phone, ''); // chat opens empty, ready to paste
  if (win) win.location.href = link;
  else window.open(link, '_blank');
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
