// Turn an uploaded letterhead (PDF or image) into a single image data URL that the PDF header can
// embed. A PDF's FIRST page is rendered to a canvas; an image is re-drawn (and downscaled) to a
// canvas. Either way we emit a JPEG data URL capped at a sensible width so the stored value — which
// lives in the pdf_settings table and travels with every PDF-layout fetch — stays small.
import * as pdfjsLib from 'pdfjs-dist';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

const MAX_WIDTH = 1400; // px — plenty for a full-width A4 header at print resolution
const JPEG_QUALITY = 0.85;

let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  const blob = new Blob([workerSource], { type: 'application/javascript' });
  pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  workerReady = true;
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_WIDTH / base.width, 3); // don't blow tiny pages up past 3x
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not render the PDF');
  // White background so a transparent/letterhead PDF prints on white, not black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvasToDataUrl(canvas);
}

function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(MAX_WIDTH / img.naturalWidth, 1); // only shrink, never upscale
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not read the image'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvasToDataUrl(canvas));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image'));
    };
    img.src = url;
  });
}

/** Convert a PDF or image file into an image data URL for use as a letterhead. */
export async function fileToLetterheadDataUrl(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  return isPdf ? pdfFirstPageToDataUrl(file) : imageFileToDataUrl(file);
}
