import { defaultPdfLayout, type PdfLayout } from '@surani/shared';
import { api } from './apiClient';

// Fetch the PDF layout once and reuse it. Never throws — falls back to defaults so a PDF
// can always be produced (e.g. before the pdf_settings migration is run).
let cache: PdfLayout | null = null;

export async function getPdfLayout(): Promise<PdfLayout> {
  if (cache) return cache;
  try {
    cache = await api.pdfSettings.get();
  } catch {
    cache = defaultPdfLayout();
  }
  return cache;
}

// Call after saving in the PDF Layout tab so the next export picks up the new values.
export function clearPdfLayoutCache() {
  cache = null;
}
