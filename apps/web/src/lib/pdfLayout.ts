import { defaultPdfLayout, type PdfLayout } from '@surani/shared';
import { api } from './apiClient';

// Fetch the PDF layout once and reuse it. Never throws — falls back to defaults so a PDF
// can always be produced (e.g. before the pdf_settings migration is run).
//
// Resilience: the editable layout also lives in this browser's localStorage. If the server write
// fails (e.g. the pdf_settings table is missing / returns 500), the values the user saved are still
// kept on THIS device and overlaid on top of whatever the server returns — so the letterhead, tagline
// and address keep showing in the PDFs here. Fixing the server only adds cross-device (phone) sync.
const LOCAL_KEY = 'surani.pdfLayout';
let cache: PdfLayout | null = null;

export function readPdfLayoutLocal(): Partial<PdfLayout> | null {
  return readLocal();
}

function readLocal(): Partial<PdfLayout> | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<PdfLayout>) : null;
  } catch {
    return null;
  }
}

export function savePdfLayoutLocal(layout: PdfLayout) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(layout));
  } catch {
    /* private mode / quota — the server copy (when it works) still covers it */
  }
  cache = null;
}

export function clearPdfLayoutLocal() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
  cache = null;
}

export async function getPdfLayout(): Promise<PdfLayout> {
  if (cache) return cache;
  let server: PdfLayout;
  try {
    server = await api.pdfSettings.get();
  } catch {
    server = defaultPdfLayout();
  }
  // Local overrides win on this device so a broken server write never loses the user's layout.
  const local = readLocal();
  cache = local ? { ...server, ...local } : server;
  return cache;
}

// Call after saving in the PDF Layout tab so the next export picks up the new values.
export function clearPdfLayoutCache() {
  cache = null;
}
