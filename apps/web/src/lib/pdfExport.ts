import type { DueLedgerGroup, PartyLedgerEntry, SalesPersonExpense } from '@surani/shared';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function openPrintWindow(html: string) {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Please allow pop-ups to export the PDF');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

const baseStyles = `
  body{font-family:Arial,Helvetica,sans-serif;color:#0b1220;padding:28px;font-size:12.5px}
  h1{font-size:19px;margin:0 0 3px;color:#0f766e}
  .sub{font-size:12px;color:#64748b;margin-bottom:22px}
  .party-block{break-inside:avoid;margin-bottom:20px}
  .party-name{font-size:13.5px;font-weight:700;background:#f0fdfa;padding:8px 12px;border:1px solid #99f6e4}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 12px;border:1px solid #e2e8f0;text-align:left}
  thead tr{background:#f5f7fb}
  tfoot tr{font-weight:700;background:#f5f7fb}
  .grand-total{margin-top:14px;font-size:15px;font-weight:800;text-align:right;border-top:2px solid #0b1220;padding-top:12px}
  @media print{ @page{margin:16mm} }
`;

export function exportDueLedgerPdf(groups: DueLedgerGroup[], spName: string) {
  if (!groups.length) {
    alert('No pending dues to export for this selection');
    return;
  }
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const partyBlocks = groups
    .map(({ party, entries, total }) => {
      const rows = entries
        .map(
          (e) => `<tr>
        <td>${e.invNo || '—'}</td>
        <td>${fmtDate(e.date)}</td>
        <td>${fmtDate(e.dueDate)}</td>
        <td>${e.dueDays === null ? 'No due date' : e.dueDays < 0 ? `${-e.dueDays}d overdue` : `${e.dueDays}d left`}</td>
        <td style="text-align:right">${inr(e.balance)}</td>
      </tr>`
        )
        .join('');
      return `<div class="party-block">
      <div class="party-name">${party.name}${party.phone ? ` &middot; ${party.phone}` : ''}</div>
      <table>
        <thead><tr><th>Invoice</th><th>Sale Date</th><th>Due Date</th><th>Status</th><th style="text-align:right">Amount (₹)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total due — ${party.name}</td><td style="text-align:right">${inr(total)}</td></tr></tfoot>
      </table>
    </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Outstanding Dues — ${spName}</title>
<style>${baseStyles}</style></head>
<body>
  <h1>SURANI AND SONS — Outstanding Dues Statement</h1>
  <div class="sub">Sales Person: <b>${spName}</b> &middot; Generated ${fmtDate(new Date().toISOString())}</div>
  ${partyBlocks}
  <div class="grand-total">Grand Total: ${inr(grandTotal)}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}

export function exportPartyLedgerPdf(partyName: string, entries: PartyLedgerEntry[], opening = 0) {
  const balStr = (b: number) => (b >= 0 ? `${inr(b)} Dr` : `${inr(Math.abs(b))} Cr`);
  const totalDr = entries.reduce((s, e) => s + e.dr, 0);
  const totalCr = entries.reduce((s, e) => s + e.cr, 0);
  const closing = opening + totalDr - totalCr;

  let running = opening;
  const rows = entries
    .map((e) => {
      running += e.dr - e.cr;
      return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.description}</td>
      <td style="text-align:right">${e.dr ? inr(e.dr) : ''}</td>
      <td style="text-align:right">${e.cr ? inr(e.cr) : ''}</td>
      <td style="text-align:right">${balStr(running)}</td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ledger — ${partyName}</title>
<style>${baseStyles}</style></head>
<body>
  <h1>SURANI AND SONS — Party Ledger</h1>
  <div class="sub">${partyName} &middot; Generated ${fmtDate(new Date().toISOString())}</div>
  <table>
    <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>
      <tr><td>—</td><td style="font-style:italic">Opening balance</td><td></td><td></td><td style="text-align:right">${balStr(opening)}</td></tr>
      ${rows}
      <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing balance</td><td></td><td></td><td style="text-align:right">${balStr(closing)}</td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">Total</td><td style="text-align:right">${inr(totalDr)}</td><td style="text-align:right">${inr(totalCr)}</td><td style="text-align:right">${balStr(closing)}</td></tr></tfoot>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}

export function exportExpenseLedgerPdf(salesPersonName: string, expenses: SalesPersonExpense[]) {
  // Oldest-first so the running balance accumulates correctly.
  const ordered = [...expenses].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  const total = ordered.reduce((s, e) => s + e.amount, 0);

  let running = 0;
  const rows = ordered
    .map((e) => {
      running += e.amount;
      return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.expenseFor}</td>
      <td style="text-align:right">${inr(e.amount)}</td>
      <td style="text-align:right">${inr(running)}</td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Expense Ledger — ${salesPersonName}</title>
<style>${baseStyles}</style></head>
<body>
  <h1>SURANI AND SONS — Sales Person Expense Ledger</h1>
  <div class="sub">${salesPersonName} &middot; Generated ${fmtDate(new Date().toISOString())}</div>
  <table>
    <thead><tr><th>Date</th><th>Expense For</th><th style="text-align:right">Amount (₹)</th><th style="text-align:right">Running Total (₹)</th></tr></thead>
    <tbody>
      <tr><td>—</td><td style="font-style:italic">Opening</td><td></td><td style="text-align:right">${inr(0)}</td></tr>
      ${rows}
      <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing Total</td><td style="text-align:right">${inr(total)}</td><td style="text-align:right">${inr(total)}</td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">Total Expense</td><td style="text-align:right">${inr(total)}</td><td></td></tr></tfoot>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}
