/**
 * Helpers for displaying files that are stored as base64 `data:` URLs.
 *
 * Attachments (invoice scans, TDS sheets, expense bills) are held in the database as data URLs.
 * They cannot be shown directly: Chromium refuses to run its built-in PDF viewer on a `data:`
 * URL inside an iframe, so the panel renders blank with no error. Converting to a Blob and using
 * a `blob:` URL sidesteps that — a blob is treated as an ordinary same-origin resource. Electron
 * is Chromium, so the desktop app behaves identically.
 *
 * Blob URLs also avoid pushing a multi-megabyte string through an element's `src`/`href`.
 */

/** Convert a `data:` URL to a Blob. Returns null if the string isn't a usable data URL. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const [, mime, isB64, payload] = m;
  try {
    if (isB64) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime || 'application/octet-stream' });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime || 'text/plain' });
  } catch {
    return null;
  }
}

/** True when the attachment should be shown in a PDF frame rather than as an image. */
export function looksLikePdf(blob: Blob, name: string): boolean {
  return blob.type === 'application/pdf' || /\.pdf$/i.test(name);
}

/**
 * Open a stored data URL in a new tab as a blob. Returns false if it could not be read, so the
 * caller can show a message instead of appearing to do nothing.
 */
export function openDataUrlInNewTab(dataUrl: string): boolean {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // The tab needs the URL to outlive this call; release it once it has certainly loaded.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
