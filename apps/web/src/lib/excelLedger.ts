import * as XLSX from 'xlsx';
import type { LedgerBill, LedgerParseResult, LedgerParty } from './ledgerImport';

// Read a Tally "Sundry Debtors – Pending Bills" export saved as Excel/CSV. Far more reliable than a
// PDF/OCR because the figures are real cell values. Layout matches the on-screen report: a header row
// (Date / Ref. No. / Party's Name / Balance / Due on), then for each party its name sits alone in the
// Party column followed by that party's bill rows, then a total row (only a Balance). We map columns
// by their header text, so extra/re-ordered columns don't matter.

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// Parse "10-Jul-26", "10/07/2026", "2026-07-10", or an Excel date serial → ISO yyyy-mm-dd (or null).
function toIso(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return null;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${mon}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(s); // dd/mm/yyyy
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); // yyyy-mm-dd
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

function parseAmount(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/,/g, '').replace(/dr|cr/gi, '').trim();
  return Number(s) || 0;
}

function findCol(header: string[], ...needles: string[]): number {
  return header.findIndex((h) => {
    const t = String(h).toLowerCase();
    return needles.some((n) => t.includes(n));
  });
}

export async function parseLedgerExcel(file: File): Promise<LedgerParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '' });

  // Find the header row and map the columns we need.
  let headerIdx = -1;
  let cDate = -1,
    cRef = -1,
    cParty = -1,
    cAmount = -1,
    cDue = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const h = (rows[i] as unknown[]).map((x) => String(x ?? ''));
    const d = findCol(h, 'date');
    const party = findCol(h, 'party', 'name');
    const amount = findCol(h, 'balance', 'amount', 'pending');
    if (d >= 0 && party >= 0 && amount >= 0) {
      headerIdx = i;
      cDate = d;
      cRef = findCol(h, 'ref', 'bill', 'vch', 'invoice');
      cParty = party;
      cAmount = amount;
      cDue = findCol(h, 'due');
      break;
    }
  }
  if (headerIdx < 0) {
    return { parties: [], skipped: ['Could not find the Date / Party / Balance columns — is this the Tally Pending Bills export?'], totalAmount: 0 };
  }

  const parties: LedgerParty[] = [];
  const skipped: string[] = [];
  let current: LedgerParty | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const cell = (c: number) => (c >= 0 ? row[c] : '');
    const dateV = cell(cDate);
    const amountV = cell(cAmount);
    const partyV = String(cell(cParty) ?? '').trim();
    const date = toIso(dateV);
    const amount = parseAmount(amountV);

    if (date && amount) {
      // A bill row.
      if (!current) {
        skipped.push(JSON.stringify(row));
        continue;
      }
      const bill: LedgerBill = {
        date,
        invNo: String(cell(cRef) ?? '').trim(),
        amount,
        dueDate: toIso(cell(cDue)),
        raw: row.map((x) => String(x ?? '')).join(' | '),
      };
      current.bills.push(bill);
      continue;
    }
    // A party-name row: a name in the Party column, no date.
    if (partyV && !date && /[A-Za-z]/.test(partyV)) {
      current = { name: partyV, bills: [] };
      parties.push(current);
      continue;
    }
    // Otherwise a total / blank / sub-header row — ignore.
  }

  const withBills = parties.filter((p) => p.bills.length > 0);
  const totalAmount = withBills.reduce((s, p) => s + p.bills.reduce((a, b) => a + b.amount, 0), 0);
  return { parties: withBills, skipped, totalAmount };
}
