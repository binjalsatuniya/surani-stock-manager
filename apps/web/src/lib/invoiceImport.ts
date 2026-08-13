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

/** One goods line off the invoice. An invoice may carry several. */
export interface ScannedLine {
  hsn: string | null;
  qty: number | null;
  rate: number | null;
  amount: number | null;
  /** qty x rate agrees with the printed line amount. */
  addsUp: boolean;
  /**
   * The item's printed description and grade, e.g. "PVC Resin-39041020 HS-1000R". One HSN covers
   * many grades, so this text — not the HSN — is what identifies the actual material. Null if the
   * line was added by hand on the review screen.
   */
  desc: string | null;
}

export interface ScannedInvoice {
  fileName: string;
  /** Exact fields from the signed QR — absent if no QR could be read. */
  qr: InvoiceQrData | null;
  /** Every goods line read off the page, in printed order. */
  lines: ScannedLine[];
  /** The lines' amounts summed, plus GST, agrees with the QR total — the strongest check there is. */
  matchesQrTotal: boolean;
  /** GST percentage implied by the goods total and the QR total. */
  impliedGstPct: number | null;
  problems: string[];
}

const num = (s: string) => Number(s.replace(/,/g, ''));

/** Tidy a raw description: drop the leading serial ("1|"), the column pipes, and extra spaces. */
const cleanDesc = (s: string) =>
  s
    .replace(/^[\s|]*\d+[\s|.]*/, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
export function parseGoodsLines(text: string): ScannedLine[] {
  const out: ScannedLine[] = [];
  const rows = text.split('\n');
  for (let idx = 0; idx < rows.length; idx++) {
    const line = rows[idx];
    const hsnMatch = /\b(\d{8})\b/.exec(line);
    if (!hsnMatch) continue;
    const after = line.slice(hsnMatch.index + 8);
    const nums = [...after.matchAll(/\b\d{1,3}(?:,\d{2,3})*(?:\.\d{1,3})?\b/g)].map((m) => num(m[0]));
    if (nums.length < 3) continue;
    // qty, rate, amount — the first three figures printed after the HSN.
    const [qty, rate, amount] = nums;
    // The item's description sits BEFORE the HSN on this line ("1| PVC Resin-39041020"); its grade
    // is usually printed on the very next line ("HS-1000R", "XINFA SG-5"). Capture both, since the
    // grade is what tells two materials sharing one HSN apart. The next line only counts as a grade
    // if it has letters and is not itself a goods line (no HSN) or a bare figure (a subtotal).
    const before = line.slice(0, hsnMatch.index);
    const next = rows[idx + 1] ?? '';
    const nextIsGrade = /[A-Za-z]/.test(next) && !/\b\d{8}\b/.test(next) && !/^[\s\d.,₹%|-]+$/.test(next);
    const desc = cleanDesc(before + (nextIsGrade ? ' ' + next : ''));
    out.push({
      hsn: hsnMatch[1],
      qty,
      rate,
      amount,
      addsUp: near(qty * rate, amount, Math.max(1, amount * 0.002)),
      desc: desc || null,
    });
  }
  // The tax summary near the foot repeats each HSN, but with its taxable value and GST rate — it
  // parses as qty = taxable, rate = 9, amount = tax, figures that do NOT multiply out. A genuine
  // goods line does (qty x rate = amount). So keep the lines that add up: that drops the summary
  // while KEEPING a second grade billed under the same HSN. (The earlier rule "same HSN = a
  // repeat, drop it" wrongly deleted that second line, so a two-item invoice read as one.)
  // If nothing adds up — a poor scan — keep the raw guesses so they can be corrected by hand on
  // the review screen rather than vanishing entirely.
  const addUp = out.filter((l) => l.addsUp);
  return addUp.length ? addUp : out;
}

const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

export async function readScannedInvoice(file: File): Promise<ScannedInvoice> {
  const result: ScannedInvoice = {
    fileName: file.name,
    qr: null,
    lines: [],
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

    result.lines = parseGoodsLines(text);

    if (result.lines.length === 0) {
      result.problems.push('Could not read any goods line (quantity and rate) from the invoice.');
      return result;
    }
    // Check 1 — each printed line: qty x rate should be its amount.
    const badLine = result.lines.findIndex((l) => !l.addsUp);
    if (badLine >= 0) result.problems.push(`Line ${badLine + 1}: quantity x rate does not equal the printed amount.`);

    // Check 2 — the whole invoice against the QR, which is exact. With several lines this is
    // stronger still: every quantity and rate has to be right for the total to come out.
    const goodsTotal = result.lines.reduce((s, l) => s + (l.amount ?? 0), 0);
    if (result.qr?.totalValue != null && goodsTotal > 0) {
      const pct = ((result.qr.totalValue - goodsTotal) / goodsTotal) * 100;
      const slab = [0, 5, 12, 18, 28].find((s) => Math.abs(pct - s) < 0.6);
      result.impliedGstPct = slab ?? Math.round(pct * 100) / 100;
      result.matchesQrTotal = slab != null;
      if (!result.matchesQrTotal) {
        result.problems.push(
          `The ${result.lines.length} goods line${result.lines.length === 1 ? '' : 's'} total ` +
            `${goodsTotal.toLocaleString('en-IN')}, which plus GST does not reach the invoice total ` +
            `${result.qr.totalValue.toLocaleString('en-IN')} at any standard rate.`
        );
      }
    }
  } catch {
    result.problems.push('Reading this file failed.');
  }
  return result;
}
