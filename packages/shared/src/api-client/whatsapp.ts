import type { HttpClient } from './http';
import type { WhatsappTemplateKey } from '../whatsapp';

export interface WhatsappTemplateRecord {
  key: WhatsappTemplateKey;
  template: string;
}

export function createWhatsappClient(http: HttpClient) {
  return {
    list: () => http.get<WhatsappTemplateRecord[]>('/whatsapp-templates'),
    update: (key: WhatsappTemplateKey, template: string) =>
      http.patch<WhatsappTemplateRecord>(`/whatsapp-templates/${key}`, { template }),
    reset: (key: WhatsappTemplateKey) =>
      http.post<WhatsappTemplateRecord>(`/whatsapp-templates/${key}/reset`, {}),
  };
}
