// The Outstanding Dues statement as a single HTML string, shared by the website/desktop (printed via
// a pop-up window) and the phone (printed via expo-print) so BOTH produce an identical document —
// same header from the editable PDF layout, same sales-person line, red overdue rows, and per-party +
// grand Total Overdue. Pass one party in `groups` for a single-party statement.
import { SURANI_LOGO_DATA_URI } from './suraniLogoData';
import type { PdfLayout } from './pdf-settings';
import type { DueLedgerGroup, UnpaidInvoice } from './api-client/ledger';

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const overdueOf = (entries: UnpaidInvoice[]) =>
  entries.reduce((a, e) => a + (e.dueDays !== null && e.dueDays < 0 ? e.balance : 0), 0);

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
  .party-sp{color:#0f766e;font-weight:600}
  table{width:100%;border-collapse:collapse}
  th,td{padding:6px 12px;border:1px solid #e2e8f0;text-align:left}
  thead tr{background:#f5f7fb}
  tfoot tr{font-weight:700;background:#f5f7fb}
  tr.overdue td{color:#dc2626;font-weight:700}
  .grand-total{margin-top:14px;font-size:15px;font-weight:800;text-align:right;border-top:2px solid #0b1220;padding-top:12px}
  @media print{ @page{margin:16mm} }
`;
}

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
  return layout.footer.trim() ? `<div class="pdf-footer" style="margin-top:26px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center">${esc(layout.footer)}</div>` : '';
}

/**
 * Build the full Outstanding Dues statement HTML. `partySpNames` maps a party id to its sales person
 * name (shown after the phone). Pass a single group for a one-party statement.
 */
export function buildDuesStatementHtml(
  groups: DueLedgerGroup[],
  spName: string,
  layout: PdfLayout,
  partySpNames: Record<string, string> = {}
): string {
  const grandTotal = groups.reduce((s, g) => s + g.total, 0);
  const grandOverdue = groups.reduce((s, g) => s + overdueOf(g.entries), 0);
  const partyBlocks = groups
    .map(({ party, entries, total }) => {
      const rows = entries
        .map((e) => {
          const overdue = e.dueDays !== null && e.dueDays < 0;
          return `<tr${overdue ? ' class="overdue"' : ''}>
        <td>${esc(e.invNo || '—')}</td>
        <td>${fmtDate(e.date)}</td>
        <td>${fmtDate(e.dueDate)}</td>
        <td>${e.dueDays === null ? 'No due date' : e.dueDays < 0 ? `${-e.dueDays}d overdue` : `${e.dueDays}d left`}</td>
        <td style="text-align:right">${inr(e.balance)}</td>
      </tr>`;
        })
        .join('');
      const sp = partySpNames[party.id];
      return `<div class="party-block">
      <div class="party-name">${esc(party.name)}${party.phone ? ` &middot; ${esc(party.phone)}` : ''}${sp ? ` &middot; <span class="party-sp">${esc(sp)}</span>` : ''}</div>
      <table>
        <thead><tr><th>Invoice</th><th>Sale Date</th><th>Due Date</th><th>Status</th><th style="text-align:right">Amount (₹)</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="4">Total due — ${esc(party.name)}</td><td style="text-align:right">${inr(total)}</td></tr>
          <tr class="overdue"><td colspan="4">Total overdue — ${esc(party.name)}</td><td style="text-align:right">${inr(overdueOf(entries))}</td></tr>
        </tfoot>
      </table>
    </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Outstanding Dues — ${esc(spName)}</title>
<style>${styles(layout.accent_color)}</style></head>
<body>
  ${header(layout, 'Outstanding Dues Statement', `Sales Person: ${esc(spName)}`, `Generated ${fmtDate(new Date().toISOString())}`)}
  ${partyBlocks}
  <div class="grand-total">Grand Total: ${inr(grandTotal)}</div>
  <div class="grand-total" style="color:#dc2626;border-top:none;padding-top:4px">Total Overdue: ${inr(grandOverdue)}</div>
  ${footer(layout)}
</body></html>`;
}
