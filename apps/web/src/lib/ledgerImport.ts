// Reads a Tally "Sundry Debtors – Pending Bills" export (text extracted from the PDF) into a list of
// parties, each with its outstanding bills. No material/item is involved — a bill is just an invoice
// number, date, amount and due date that the party still owes.
//
// Tally lays the report out as: a party's name on its own line, then each of that party's pending
// bills on a line of the form  "<date> <ref no> <amount> Dr <due date>", then a per-party or grand
// total line that is just an amount. We detect each kind by shape, so small spacing differences in
// the extracted text don't matter.

export interface LedgerBill {
  date: string; // ISO yyyy-mm-dd
  invNo: string;
  amount: number;
  dueDate: string | null; // ISO yyyy-mm-dd, or null if Tally didn't print one
  raw: string; // the original line, kept so the review screen can show what was read
}

export interface LedgerParty {
  name: string;
  bills: LedgerBill[];
}

export interface LedgerParseResult {
  parties: LedgerParty[];
  /** Lines we couldn't classify (shown to the user as "couldn't read these"). */
  skipped: string[];
  totalAmount: number;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// "10-Jul-26" / "1-Apr-2023" → "2026-07-10". Tally uses 2-digit years; treat them as 2000+.
function toIso(d: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})$/.exec(d.trim());
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  let year = m[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${mon}-${day}`;
}

const DATE = '\\d{1,2}-[A-Za-z]{3,}-\\d{2,4}';
// A bill row: date, ref no (any non-space token), amount (Indian/plain number, 2dp optional), the
// "Dr" marker, then the due date. The ref no is non-greedy so the amount still binds to the number.
const BILL_RE = new RegExp(
  `^(${DATE})\\s+(\\S.*?)\\s+([\\d,]+(?:\\.\\d{1,2})?)\\s*Dr\\b\\s*(${DATE})?`,
  'i'
);
// A line that is only an amount (optionally with Dr) — a subtotal / grand total. Skipped.
const TOTAL_RE = new RegExp(`^[\\d,]+(?:\\.\\d{1,2})?\\s*(Dr|Cr)?$`, 'i');
// Report header / chrome lines to ignore outright.
const NOISE_RE = /^(group\s*:|details\s*of|date\b.*ref|particulars|opening balance|closing balance|carried over|brought forward|page\s*\d|continued|sundry debtors|pending bills|\d{1,2}-[A-Za-z]{3,}-\d{2,4}\s+to\s+)/i;

function parseAmount(s: string): number {
  return Number(s.replace(/,/g, '')) || 0;
}

export function parseLedgerText(text: string): LedgerParseResult {
  const parties: LedgerParty[] = [];
  const skipped: string[] = [];
  let current: LedgerParty | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (NOISE_RE.test(line)) continue;
    if (TOTAL_RE.test(line)) continue; // subtotal / grand total — not a bill

    const bill = BILL_RE.exec(line);
    if (bill) {
      const date = toIso(bill[1]);
      const amount = parseAmount(bill[3]);
      const dueDate = bill[4] ? toIso(bill[4]) : null;
      if (!date || !amount) {
        skipped.push(rawLine.trim());
        continue;
      }
      if (!current) {
        // A bill with no party above it — can't attribute it. Report it.
        skipped.push(rawLine.trim());
        continue;
      }
      current.bills.push({ date, invNo: bill[2].trim(), amount, dueDate, raw: rawLine.trim() });
      continue;
    }

    // Not a bill, not noise, not a total → treat as a party name (a new block).
    // Guard: must contain a letter (ignore stray punctuation / rule lines).
    if (/[A-Za-z]/.test(line)) {
      current = { name: line, bills: [] };
      parties.push(current);
      continue;
    }
    skipped.push(rawLine.trim());
  }

  // Drop party blocks that ended up with no bills (usually a mis-read header line).
  const withBills = parties.filter((p) => p.bills.length > 0);
  const totalAmount = withBills.reduce((s, p) => s + p.bills.reduce((a, b) => a + b.amount, 0), 0);
  return { parties: withBills, skipped, totalAmount };
}
