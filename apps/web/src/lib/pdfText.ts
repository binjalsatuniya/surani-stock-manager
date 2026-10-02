import * as pdfjsLib from 'pdfjs-dist';
// Inline the worker as a string and run it from a blob URL. This is origin-independent, so it works
// both on the website (https) and inside the packaged desktop app (which loads from file://, where a
// normal asset-URL worker fails). Done once at module load.
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  const blob = new Blob([workerSource], { type: 'application/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  workerReady = true;
}

/**
 * Extract the text of a PDF as lines, reconstructed from each glyph's position. pdf.js hands back
 * text items with x/y coordinates in no particular order; we group items that share a baseline (same
 * y, within a tolerance) into one line and sort them left-to-right, then order the lines top-to-bottom
 * per page. That turns a Tally table back into the "<date> <ref> <amount> Dr <due>" lines the ledger
 * parser expects.
 */
export async function extractPdfText(file: File): Promise<string> {
  ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Bucket text items by rounded y (baseline). transform[5] is the y position; [4] is x.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!('str' in item)) continue;
      const y = Math.round((item.transform[5] as number) / 2) * 2; // 2px tolerance
      const x = item.transform[4] as number;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s: item.str });
    }
    // y descends down the page, so sort keys high→low; within a row sort x low→high.
    const ys = [...rows.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x);
      const line = parts.map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    }
    page.cleanup();
  }
  return lines.join('\n');
}

/**
 * Fallback for PDFs whose embedded text is unusable (e.g. Tally exports with a broken font/ToUnicode
 * map, where extractPdfText returns gibberish): render each page to an image and OCR the pixels. Slow
 * but reads the real figures. `onProgress(page, total)` lets the UI show progress.
 */
export async function ocrPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<string> {
  ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      onProgress?.(p, pdf.numPages);
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 }); // 2x for sharper OCR
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      out += (await worker.recognize(canvas)).data.text + '\n';
      page.cleanup();
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
