// OCR an image (a pasted or uploaded screenshot of a Tally ledger) to text, using the same
// Tesseract engine the invoice scanner already uses. Less exact than reading a PDF's real text —
// digits can be misread — so the ledger review screen is where the user verifies before importing.
export async function ocrImageText(file: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const url = URL.createObjectURL(file);
    try {
      const { data } = await worker.recognize(url);
      return data.text;
    } finally {
      URL.revokeObjectURL(url);
    }
  } finally {
    await worker.terminate();
  }
}
