import jsQR from 'jsqr';

/**
 * Reads the government e-Invoice QR code off a scanned invoice.
 *
 * Indian e-Invoices carry a signed QR (issued by NIC) holding the document number, date, total
 * and both GSTINs. Reading it is exact — unlike OCR it either decodes or it doesn't, so there is
 * no risk of a silently misread digit.
 *
 * The scans we get are image-only PDFs whose pages are plain JPEGs, so rather than pull in a full
 * PDF renderer we carve the embedded JPEG straight out of the file. That keeps this to one tiny
 * dependency and avoids shipping a PDF worker inside Electron.
 */
export interface InvoiceQrData {
  /** Document number exactly as registered, e.g. "SAS/461/2026-27". */
  docNo: string;
  /** Invoice date as yyyy-mm-dd, converted from the QR's dd/mm/yyyy. */
  docDate: string;
  /** Total invoice value including tax. */
  totalValue: number | null;
  buyerGstin: string | null;
  sellerGstin: string | null;
  irn: string | null;
}

/** Pull every embedded JPEG out of a PDF by scanning for JPEG start/end markers.
 *  Exported so it can be exercised directly against real invoice files in tests. */
export function carveJpegs(bytes: Uint8Array, limit = 2): Blob[] {
  const out: Blob[] = [];
  let i = 0;
  while (i < bytes.length - 3 && out.length < limit) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let j = i + 2;
      let end = -1;
      while (j < bytes.length - 1) {
        if (bytes[j] !== 0xff) { j++; continue; }
        const marker = bytes[j + 1];
        if (marker === 0xd9) { end = j + 2; break; }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff || marker === 0x01) { j += 2; continue; }
        const len = (bytes[j + 2] << 8) | bytes[j + 3];
        if (len < 2) { j += 2; continue; }
        if (marker === 0xda) {
          j = j + 2 + len;
          while (j < bytes.length - 1 && !(bytes[j] === 0xff && bytes[j + 1] !== 0x00 && !(bytes[j + 1] >= 0xd0 && bytes[j + 1] <= 0xd7))) j++;
          continue;
        }
        j = j + 2 + len;
      }
      if (end > i) {
        out.push(new Blob([bytes.slice(i, end)], { type: 'image/jpeg' }));
        i = end;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** Shared with the vehicle-number reader, which works on the same carved pages. */
export function loadImage(src: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not load image')); };
    img.src = url;
  });
}

/**
 * Scan one image for a QR. The raw scan often fails to decode because a faint colour scan gives
 * the detector poor contrast, so we retry with the image forced to pure black and white at a few
 * cut-off points. On a real scan this succeeded at a threshold of 120 where the raw image failed.
 */
function findQr(img: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // The QR is printed in the top-right, but try the whole page too in case the layout differs.
  const windows: [number, number, number, number][] = [
    [0.6, 0, 0.4, 0.22],
    [0.5, 0, 0.5, 0.3],
    [0, 0, 1, 0.35],
    [0, 0, 1, 1],
  ];

  for (const [fx, fy, fw, fh] of windows) {
    const sx = Math.floor(img.width * fx);
    const sy = Math.floor(img.height * fy);
    const sw = Math.max(1, Math.floor(img.width * fw));
    const sh = Math.max(1, Math.floor(img.height * fh));
    canvas.width = sw;
    canvas.height = sh;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const base = ctx.getImageData(0, 0, sw, sh);

    for (const threshold of [null, 120, 100, 140, 160, 180]) {
      const data = new Uint8ClampedArray(base.data);
      if (threshold !== null) {
        for (let p = 0; p < data.length; p += 4) {
          const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          const v = lum < threshold ? 0 : 255;
          data[p] = data[p + 1] = data[p + 2] = v;
        }
      }
      const res = jsQR(data, sw, sh, { inversionAttempts: 'attemptBoth' });
      if (res?.data) return res.data;
    }
  }
  return null;
}

/** Decode the NIC JWS payload into the fields we care about.
 *  Exported so it can be exercised directly against real invoice files in tests. */
export function parsePayload(token: string): InvoiceQrData | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const outer = JSON.parse(json);
    const inv = typeof outer.data === 'string' ? JSON.parse(outer.data) : outer.data;
    if (!inv?.DocNo) return null;

    // DocDt is dd/mm/yyyy; the date inputs need yyyy-mm-dd.
    let docDate = '';
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(inv.DocDt || ''));
    if (m) docDate = `${m[3]}-${m[2]}-${m[1]}`;

    return {
      docNo: String(inv.DocNo),
      docDate,
      totalValue: inv.TotInvVal != null ? Number(inv.TotInvVal) : null,
      buyerGstin: inv.BuyerGstin ? String(inv.BuyerGstin) : null,
      sellerGstin: inv.SellerGstin ? String(inv.SellerGstin) : null,
      irn: inv.Irn ? String(inv.Irn) : null,
    };
  } catch {
    return null;
  }
}

/** Returns the invoice details, or null when there is no readable QR. */
export async function readInvoiceQr(file: File): Promise<InvoiceQrData | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // An attached photo/scan image can be read directly; a PDF needs its page images carved out.
    const images = file.type.startsWith('image/') ? [file as Blob] : carveJpegs(bytes);
    for (const blob of images) {
      const img = await loadImage(blob);
      const token = findQr(img);
      if (token) {
        const parsed = parsePayload(token);
        if (parsed) return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}
