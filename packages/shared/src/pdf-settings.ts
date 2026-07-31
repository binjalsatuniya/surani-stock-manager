// Editable layout for the generated PDFs (Party Ledger, Outstanding Dues, Expense Ledger).
// Managed by the primary Super Admin in the "PDF Layout" tab; stored server-side as key/value.

export type PdfSettingKey = 'company_name' | 'address' | 'footer' | 'accent_color';

export interface PdfSettingDef {
  key: PdfSettingKey;
  label: string;
  hint?: string;
  default: string;
  type: 'text' | 'color';
}

export const PDF_SETTINGS: PdfSettingDef[] = [
  { key: 'company_name', label: 'Company name (header)', default: 'SURANI AND SONS', type: 'text' },
  {
    key: 'address',
    label: 'Address / sub-line',
    hint: 'Shown small under the company name. Leave blank to hide.',
    default: '',
    type: 'text',
  },
  {
    key: 'footer',
    label: 'Footer note',
    hint: 'Shown at the very bottom of every PDF. Leave blank to hide.',
    default: '',
    type: 'text',
  },
  { key: 'accent_color', label: 'Heading colour', default: '#0f766e', type: 'color' },
];

export type PdfLayout = Record<PdfSettingKey, string>;

export function defaultPdfLayout(): PdfLayout {
  return PDF_SETTINGS.reduce((o, s) => {
    o[s.key] = s.default;
    return o;
  }, {} as PdfLayout);
}

export function pdfSettingDefault(key: PdfSettingKey): string {
  return PDF_SETTINGS.find((s) => s.key === key)!.default;
}
