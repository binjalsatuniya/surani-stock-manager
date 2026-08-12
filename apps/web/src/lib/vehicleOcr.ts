import { carveJpegs, loadImage } from './invoiceQr';

/**
 * Reads the vehicle number off the e-Way Bill page of a scanned dispatch document.
 *
 * Unlike the invoice number and date, this cannot be read exactly: the government's e-Way Bill QR
 * carries only the bill number, the generator's GSTIN and the generation time — the vehicle number
 * is printed text only (verified by decoding a real e-Way Bill QR). So this is OCR, and OCR guesses.
 *
 * What makes it usable is the shape of an Indian registration — two letters, one or two digits,
 * one to three letters, four digits. Misread text almost never matches that, so anything which
 * doesn't match is discarded rather than filled in. Tested against real scans at 196 DPI: it read
 * GJ27TT5983 correctly, and returned nothing on a document whose Part B was never entered.
 *
 * The engine is imported on demand so it costs nothing until an invoice is actually attached.
 */

const VEHICLE = /\b([A-Z]{2})[\s-]?(\d{1,2})[\s-]?([A-Z]{1,3})[\s-]?(\d{4})\b/g;

/** First registration-shaped string in the text, with spacing removed. */
function findVehicle(text: string): string | null {
  const hits = [...text.toUpperCase().matchAll(VEHICLE)].map((m) => m[1] + m[2] + m[3] + m[4]);
  return hits[0] ?? null;
}

/**
 * Greyscale, stretch the contrast and double the size. A 196 DPI colour scan is below what OCR
 * wants; this lifted the read from unreliable to correct on real documents.
 */
function preprocess(img: HTMLImageElement, fy: number, fh: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const sy = Math.floor(img.height * fy);
  const sh = Math.max(1, Math.floor(img.height * fh));
  const scale = 2;
  canvas.width = img.width * scale;
  canvas.height = sh * scale;
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

/** Returns the vehicle number, or null when there isn't one to be found. */
export async function readVehicleNumber(file: File): Promise<string | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pages = file.type.startsWith('image/') ? [file as Blob] : carveJpegs(bytes, 12);
    if (!pages.length) return null;

    // The e-Way Bill is the last page of these dispatch sets, so start from the back and stop
    // early. Scanning every page would cost seconds each for pages that cannot contain it.
    const candidates = [...pages].reverse().slice(0, 2);

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      for (const blob of candidates) {
        const img = await loadImage(blob);
        // The Vehicle Details table sits low on the page; try that band before the whole page.
        for (const [fy, fh] of [
          [0.5, 0.45],
          [0, 1],
        ]) {
          const canvas = preprocess(img, fy, fh);
          if (!canvas) continue;
          const { data } = await worker.recognize(canvas);
          const hit = findVehicle(data.text);
          if (hit) return hit;
        }
      }
    } finally {
      await worker.terminate();
    }
    return null;
  } catch {
    // Never let a failed read block a dispatch — the field simply stays empty.
    return null;
  }
}
