import { carveJpegs, loadImage, readInvoiceQr, type InvoiceQrData } from './invoiceQr';

/**
 * Reads a scanned sales invoice well enough to draft an Outward entry from it.
 *
 * Two sources, with very different standing:
 *   - The e-Invoice QR is signed government data — invoice number, date, buyer GSTIN and total
 *     value are exact.
 *   - Quantity, rate and the HSN code have to be read off the page by OCR, which guesses.
 *
 * What makes the guesses safe to use is that they can be checked against the exact figures:
 * qty x rate must equal the line amount, and the line amount plus GST must equal the QR's total.
 * A misread digit breaks that arithmetic, so bad rows can be flagged instead of imported.
 * Nothing here writes anything; it produces a draft for a human to approve.
 */

export interface ScannedInvoice {
  fileName: string;
  /** Exact fields from the signed QR — absent if no QR could be read. */
  qr: InvoiceQrData | null;
  /** OCR guesses. */
  hsn: string | null;
  qty: number | null;
  rate: number | null;
  lineAmount: number | null;
  /** qty x rate agrees with the printed line amount. */
  lineAddsUp: boolean;
  /** line amount + GST agrees with the QR's total (the strongest check available). */
  matchesQrTotal: boolean;
  /** Implied GST percentage, derived from the line amount and the QR total. */
  impliedGstPct: number | null;
  problems: string[];
}

const num = (s: string) => Number(s.replace(/,/g, ''));

/** Grey, stretch contrast and enlarge — a 196 DPI colour scan is below what OCR wants. */
function prep(img: HTMLImageElement, fy: number, fh: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const sy = Math.floor(img.height * fy);
  const sh = Math.max(1, Math.floor(img.height * fh));
  canvas.width = img.width * 2;
  canvas.height = sh * 2;
  ctx.drawImage(img, 0, sy, img.width, sh, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 110 ? 0 : lum > 190 ? 255 : Math.round((lum - 110) * (255 / 80));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/**
 * Pull the goods line out of OCR text. The line carrying the 8-digit HSN code is the one that
 * also carries quantity, rate and amount, in that order — anchoring on the HSN is far more stable
 * than trying to locate table columns on a scan.
 */
export function parseGoodsLine(text: string): { hsn: string | null; qty: number | null; rate: number | null; amount: number | null } {
  const empty = { hsn: null, qty: null, rate: null, amount: null };
  for (const line of text.split('\n')) {
    const hsnMatch = /\b(\d{8})\b/.exec(line);
    if (!hsnMatch) continue;
    const after = line.slice(hsnMatch.index + 8);
    const nums = [...after.matchAll(/\b\d{1,3}(?:,\d{2,3})*(?:\.\d{1,3})?\b/g)].map((m) => num(m[0]));
    if (nums.length < 3) continue;
    // qty, rate, amount — the first three figures printed after the HSN.
    return { hsn: hsnMatch[1], qty: nums[0], rate: nums[1], amount: nums[2] };
  }
  return empty;
}

const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

export async function readScannedInvoice(file: File): Promise<ScannedInvoice> {
  const result: ScannedInvoice = {
    fileName: file.name,
    qr: null,
    hsn: null,
    qty: null,
    rate: null,
    lineAmount: null,
    lineAddsUp: false,
    matchesQrTotal: false,
    impliedGstPct: null,
    problems: [],
  };

  result.qr = await readInvoiceQr(file);
  if (!result.qr) result.problems.push('No e-Invoice QR found — invoice number, date and party cannot be trusted.');

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pages = file.type.startsWith('image/') ? [file as Blob] : carveJpegs(bytes, 12);
    if (!pages.length) {
      result.problems.push('Could not read any page image from this file.');
      return result;
    }
    const img = await loadImage(pages[0]); // the tax invoice is always the first page
    const canvas = prep(img, 0.38, 0.35); // the goods table band
    if (!canvas) {
      result.problems.push('Could not prepare the page for reading.');
      return result;
    }
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    let text = '';
    try {
      text = (await worker.recognize(canvas)).data.text;
    } finally {
      await worker.terminate();
    }

    const goods = parseGoodsLine(text);
    result.hsn = goods.hsn;
    result.qty = goods.qty;
    result.rate = goods.rate;
    result.lineAmount = goods.amount;

    if (goods.qty == null || goods.rate == null || goods.amount == null) {
      result.problems.push('Could not read quantity and rate from the goods table.');
      return result;
    }

    // Check 1 — the printed line: qty x rate should be the line amount.
    result.lineAddsUp = near(goods.qty * goods.rate, goods.amount, Math.max(1, goods.amount * 0.002));
    if (!result.lineAddsUp) result.problems.push('Quantity x rate does not equal the printed amount.');

    // Check 2 — against the QR, which is exact. This is what catches a misread digit.
    if (result.qr?.totalValue != null && goods.amount > 0) {
      const pct = ((result.qr.totalValue - goods.amount) / goods.amount) * 100;
      const slab = [0, 5, 12, 18, 28].find((s) => Math.abs(pct - s) < 0.6);
      result.impliedGstPct = slab ?? Math.round(pct * 100) / 100;
      result.matchesQrTotal = slab != null;
      if (!result.matchesQrTotal) {
        result.problems.push(
          `Goods value ${goods.amount.toLocaleString('en-IN')} plus GST does not reach the invoice total ` +
            `${result.qr.totalValue.toLocaleString('en-IN')} at any standard rate.`
        );
      }
    }
  } catch {
    result.problems.push('Reading this file failed.');
  }
  return result;
}
