import { useEffect, useState } from 'react';
import { fillWhatsappTemplate, type WhatsappTemplateKey, type WhatsappTemplateRecord } from '@surani/shared';
import { api } from '../lib/apiClient';

/** Fetches WhatsApp templates once and exposes a fill(key, vars) helper for building share messages. */
export function useWhatsappTemplates() {
  const [templates, setTemplates] = useState<WhatsappTemplateRecord[] | null>(null);

  useEffect(() => {
    api.whatsapp.list().then(setTemplates);
  }, []);

  function fill(key: WhatsappTemplateKey, vars: Record<string, string>): string | null {
    const record = templates?.find((t) => t.key === key);
    if (!record) return null;
    return fillWhatsappTemplate(record.template, vars);
  }

  return { templates, fill };
}
