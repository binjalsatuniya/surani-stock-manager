import { defaultPdfLayout, type DueLedgerGroup, type ItemLedgerEntry, type PartyLedgerEntry, type PdfLayout, type SalesPersonExpense } from '@surani/shared';
import { SURANI_LOGO_DATA_URI } from './suraniLogoData';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function styles(accent: string) {
  return `
  body{font-family:Arial,Helvetica,sans-serif;color:#0b1220;padding:28px;font-size:12.5px}
  .pdf-head{display:flex;align-items:center;gap:14px;margin-bottom:2px}
  .pdf-logo{width:56px;height:56px;object-fit:contain;flex:none}
  h1{font-size:20px;margin:0;color:${esc(accent)}}
  .pdf-title{color:#334155;font-weight:700}
  .tagline{font-size:11px;font-style:italic;color:#5b7076;margin-top:1px}
  .addr{font-size:11.5px;color:#475569;margin:3px 0 10px}
  .subject{font-size:22px;font-weight:800;color:#0b1220;text-align:center;margin:10px 0 2px}
  .meta{font-size:12px;color:#64748b;text-align:center;margin-bottom:22px}
  .party-block{break-inside:avoid;margin-bottom:20px}
  .party-name{font-size:13.5px;font-weight:700;background:#f0fdfa;padding:8px 12px;border:1px solid #99f6e4}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 12px;border:1px solid #e2e8f0;text-align:left}
  thead tr{background:#f5f7fb}
  tfoot tr{font-weight:700;background:#f5f7fb}
  .grand-total{margin-top:14px;font-size:15px;font-weight:800;text-align:right;border-top:2px solid #0b1220;padding-top:12px}
  .pdf-footer{margin-top:26px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center}
  @media print{ @page{margin:16mm} }
`;
}

// Header (logo + company name + optional address), a prominent subject line (party / sales person),
// then a small meta line. Built from the editable layout.
function header(layout: PdfLayout, title: string, subject: string, meta: string) {
  const tagline = layout.tagline.trim() ? `<div class="tagline">${esc(layout.tagline)}</div>` : '';
  const addr = layout.address.trim() ? `<div class="addr">${esc(layout.address)}</div>` : '';
  return `<div class="pdf-head">
    <img class="pdf-logo" src="${SURANI_LOGO_DATA_URI}" alt="">
    <div><h1>${esc(layout.company_name)} <span class="pdf-title">— ${esc(title)}</span></h1>${tagline}${addr}</div>
  </div>
  <div class="subject">${subject}</div>
  <div class="meta">${meta}</div>`;
}
function footer(layout: PdfLayout) {
  return layout.footer.trim() ? `<div class="pdf-footer">${esc(layout.footer)}</div>` : '';
}

export function exportDueLedgerPdf(groups: DueLedgerGroup[], spName: string, layout: PdfLayout = defaultPdfLayout()) {
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
<style>${styles(layout.accent_color)}</style></head>
<body>
  ${header(layout, 'Outstanding Dues Statement', `Sales Person: ${esc(spName)}`, `Generated ${fmtDate(new Date().toISOString())}`)}
  ${partyBlocks}
  <div class="grand-total">Grand Total: ${inr(grandTotal)}</div>
  ${footer(layout)}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}

export function exportPartyLedgerPdf(partyName: string, entries: PartyLedgerEntry[], opening = 0, layout: PdfLayout = defaultPdfLayout()) {
  const balStr = (b: number) => (b >= 0 ? `${inr(b)} Dr` : `${inr(Math.abs(b))} Cr`);
  const totalDr = entries.reduce((s, e) => s + e.dr, 0);
  const totalCr = entries.reduce((s, e) => s + e.cr, 0);
  const totalTaxable = entries.reduce((s, e) => s + (e.taxable ?? 0), 0);
  const totalTax = entries.reduce((s, e) => s + (e.tax ?? 0), 0);
  const closing = opening + totalDr - totalCr;

  let running = opening;
  const rows = entries
    .map((e) => {
      running += e.dr - e.cr;
      return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${e.description}</td>
      <td style="text-align:right">${e.taxable != null ? inr(e.taxable) : ''}</td>
      <td style="text-align:right">${e.tax != null ? inr(e.tax) : ''}</td>
      <td style="text-align:right">${e.dr ? inr(e.dr) : ''}</td>
      <td style="text-align:right">${e.cr ? inr(e.cr) : ''}</td>
      <td style="text-align:right">${balStr(running)}</td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ledger — ${partyName}</title>
<style>${styles(layout.accent_color)}</style></head>
<body>
  ${header(layout, 'Party Ledger', esc(partyName), `Generated ${fmtDate(new Date().toISOString())}`)}
  <table>
    <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Taxable</th><th style="text-align:right">GST</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>
      <tr><td>—</td><td style="font-style:italic">Opening balance</td><td></td><td></td><td></td><td></td><td style="text-align:right">${balStr(opening)}</td></tr>
      ${rows}
      <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing balance</td><td></td><td></td><td></td><td></td><td style="text-align:right">${balStr(closing)}</td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">Total</td><td style="text-align:right">${inr(totalTaxable)}</td><td style="text-align:right">${inr(totalTax)}</td><td style="text-align:right">${inr(totalDr)}</td><td style="text-align:right">${inr(totalCr)}</td><td style="text-align:right">${balStr(closing)}</td></tr></tfoot>
  </table>
  ${footer(layout)}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}

export function exportItemLedgerPdf(
  itemName: string,
  unit: string,
  entries: ItemLedgerEntry[],
  opening = 0,
  layout: PdfLayout = defaultPdfLayout()
) {
  const qty = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 3 })}`;
  const totalIn = entries.reduce((s, e) => s + e.qtyIn, 0);
  const totalOut = entries.reduce((s, e) => s + e.qtyOut, 0);
  const totalTaxable = entries.reduce((s, e) => s + e.taxable, 0);
  const totalTax = entries.reduce((s, e) => s + e.tax, 0);
  const totalValue = entries.reduce((s, e) => s + e.total, 0);
  const closing = opening + totalIn - totalOut;

  let running = opening;
  const rows = entries
    .map((e) => {
      running += e.qtyIn - e.qtyOut;
      return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td>${esc(e.description)}</td>
      <td>${esc(e.partyName)}</td>
      <td style="text-align:right">${e.qtyIn ? qty(e.qtyIn) : ''}</td>
      <td style="text-align:right">${e.qtyOut ? qty(e.qtyOut) : ''}</td>
      <td style="text-align:right">${qty(running)}</td>
      <td style="text-align:right">${inr(e.rate)}</td>
      <td style="text-align:right">${inr(e.taxable)}</td>
      <td style="text-align:right">${inr(e.tax)}</td>
      <td style="text-align:right">${inr(e.total)}</td>
    </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Item Ledger — ${esc(itemName)}</title>
<style>${styles(layout.accent_color)}</style></head>
<body>
  ${header(layout, 'Item Ledger', esc(itemName), `Generated ${fmtDate(new Date().toISOString())}`)}
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Party</th><th style="text-align:right">Qty In</th><th style="text-align:right">Qty Out</th><th style="text-align:right">Stock</th><th style="text-align:right">Rate</th><th style="text-align:right">Taxable</th><th style="text-align:right">GST</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>
      <tr><td>—</td><td style="font-style:italic">Opening stock</td><td></td><td></td><td></td><td style="text-align:right">${qty(opening)}</td><td></td><td></td><td></td><td></td></tr>
      ${rows}
      <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing stock</td><td></td><td></td><td></td><td style="text-align:right">${qty(closing)} ${esc(unit)}</td><td></td><td></td><td></td><td></td></tr>
    </tbody>
    <tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${qty(totalIn)}</td><td style="text-align:right">${qty(totalOut)}</td><td style="text-align:right">${qty(closing)}</td><td></td><td style="text-align:right">${inr(totalTaxable)}</td><td style="text-align:right">${inr(totalTax)}</td><td style="text-align:right">${inr(totalValue)}</td></tr></tfoot>
  </table>
  ${footer(layout)}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}

export function exportExpenseLedgerPdf(salesPersonName: string, expenses: SalesPersonExpense[], layout: PdfLayout = defaultPdfLayout()) {
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
<style>${styles(layout.accent_color)}</style></head>
<body>
  ${header(layout, 'Sales Person Expense Ledger', esc(salesPersonName), `Generated ${fmtDate(new Date().toISOString())}`)}
  <table>
    <thead><tr><th>Date</th><th>Expense For</th><th style="text-align:right">Amount (₹)</th><th style="text-align:right">Running Total (₹)</th></tr></thead>
    <tbody>
      <tr><td>—</td><td style="font-style:italic">Opening</td><td></td><td style="text-align:right">${inr(0)}</td></tr>
      ${rows}
      <tr style="background:#f5f7fb;font-weight:700"><td>—</td><td>Closing Total</td><td style="text-align:right">${inr(total)}</td><td style="text-align:right">${inr(total)}</td></tr>
    </tbody>
    <tfoot><tr><td colspan="2">Total Expense</td><td style="text-align:right">${inr(total)}</td><td></td></tr></tfoot>
  </table>
  ${footer(layout)}
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 200); };</script>
</body></html>`;

  openPrintWindow(html);
}
