import type { HttpClient } from './http';
import type { PdfLayout, PdfSettingKey } from '../pdf-settings';

// Read is available to any signed-in user (needed to render PDFs); writes are Super-Admin-only,
// enforced server-side. Each write returns the full merged layout.
export function createPdfSettingsClient(http: HttpClient) {
  return {
    get: () => http.get<PdfLayout>('/pdf-settings'),
    update: (key: PdfSettingKey, value: string) => http.patch<PdfLayout>(`/pdf-settings/${key}`, { value }),
    reset: (key: PdfSettingKey) => http.post<PdfLayout>(`/pdf-settings/${key}/reset`, {}),
  };
}
