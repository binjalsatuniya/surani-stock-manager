// Editable layout for the generated PDFs (Party Ledger, Outstanding Dues, Expense Ledger).
// Managed by the primary Super Admin in the "PDF Layout" tab; stored server-side as key/value.

export type PdfSettingKey = 'company_name' | 'tagline' | 'address' | 'footer' | 'accent_color' | 'letterhead';

export interface PdfSettingDef {
  key: PdfSettingKey;
  label: string;
  hint?: string;
  default: string;
  type: 'text' | 'color' | 'image';
}

export const PDF_SETTINGS: PdfSettingDef[] = [
  {
    key: 'letterhead',
    label: 'Letterhead (top of every PDF)',
    hint: 'Upload your letterhead as a PDF or image. When set, it replaces the logo / name / tagline / address header. Leave empty to use the text header below.',
    default: '',
    type: 'image',
  },
  { key: 'company_name', label: 'Company name (header)', default: 'SURANI AND SONS', type: 'text' },
  {
    key: 'tagline',
    label: 'Tagline (under the name)',
    hint: 'The italic line from your logo. Leave blank to hide.',
    default: 'A Legacy Driven by Value',
    type: 'text',
  },
  {
    key: 'address',
    label: 'Address / sub-line',
    hint: 'Shown small under the company name. Leave blank to use the default address.',
    default: 'SHOP NO. 5, SHREE KUBER SHOPPING CENTER, NR. BHARAT PARTY PLOT, OPP. BHARATINAGAR, RABARI COLONY CROSS ROAD, AMRAIWADI, Ahmedabad, Gujarat, 380026.',
    type: 'text',
  },
  {
    key: 'footer',
    label: 'Footer note',
    hint: 'Shown at the very bottom of every PDF. Leave blank to hide.',
    default: '',
    type: 'text',
  },
  { key: 'accent_color', label: 'Heading colour', default: '#147b8b', type: 'color' },
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
