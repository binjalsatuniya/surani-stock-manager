import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Party, PartyLedgerEntry } from '@surani/shared';
import { buildWhatsappLink } from '@surani/shared';
import { api } from '../lib/apiClient';
import { exportPartyLedgerPdf } from '../lib/pdfExport';
import { getPdfLayout } from '../lib/pdfLayout';
import { usePermission } from '../hooks/usePermission';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const balStr = (b: number) => (b >= 0 ? `₹${b.toFixed(2)} Dr` : `₹${Math.abs(b).toFixed(2)} Cr`);

export function PartyLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const can = usePermission();
  const { fill } = useWhatsappTemplates();
  const [party, setParty] = useState<Party | null>(null);
  const [entries, setEntries] = useState<PartyLedgerEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    api.parties.list().then((all) => setParty(all.find((p) => p.id === id) ?? null));
    api.ledger.party(id).then(setEntries);
  }, [id]);

  const opening = Number(party?.opening ?? 0);
  const totalDr = entries.reduce((s, e) => s + e.dr, 0);
  const totalCr = entries.reduce((s, e) => s + e.cr, 0);
  const totalTaxable = entries.reduce((s, e) => s + (e.taxable ?? 0), 0);
  const totalTax = entries.reduce((s, e) => s + (e.tax ?? 0), 0);
  const closing = opening + totalDr - totalCr; // + = they owe you, − = you owe them

  // Pre-compute a running balance for each row (starting from the opening balance).
  let running = opening;
  const rows = entries.map((e) => {
    running += e.dr - e.cr;
    return { ...e, balance: running };
  });

  function onShare() {
    if (!party) return;
    const lines = rows.map((e) => {
      const amt = e.dr > 0 ? `+₹${e.dr.toFixed(2)}` : `-₹${e.cr.toFixed(2)}`;
      return `${fmtDate(e.date)} — ${e.description}\n   ${amt} → ${balStr(e.balance)}`;
    });
    const message = fill('ledgerStatement', {
      partyName: party.name,
      date: fmtDate(new Date().toISOString()),
      lines: lines.length ? lines.join('\n\n') : 'No transactions yet.',
      closingBalance: balStr(closing),
    });
    if (message) window.open(buildWhatsappLink(party.phone, message), '_blank');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="toolbar" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Ledger — {party?.name || '…'}</h2>
          {can('send_whatsapp') && party?.phone && (
            <button className="btn btn-sm" onClick={onShare}>
              Share on WhatsApp
            </button>
          )}
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => exportPartyLedgerPdf(party?.name || 'Party', entries, opening, await getPdfLayout())}
          >
            Export PDF
          </button>
        </div>
        {/* Outstanding summary */}
        <div
          style={{
            marginTop: 8,
            display: 'inline-block',
            background: closing > 0 ? '#f0fdf4' : closing < 0 ? '#fef2f2' : 'var(--surface-2)',
            border: `1px solid ${closing > 0 ? '#bbf7d0' : closing < 0 ? '#fecaca' : 'var(--line)'}`,
            borderRadius: 10,
            padding: '12px 16px',
          }}
        >
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {closing > 0 ? 'Amount receivable (they owe you)' : closing < 0 ? 'Amount payable (you owe them)' : 'Settled — nothing pending'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: closing > 0 ? '#15803d' : closing < 0 ? '#dc2626' : 'var(--ink)' }}>
            {balStr(closing)}
          </div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Taxable</th>
              <th style={{ textAlign: 'right' }}>GST</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
              <th style={{ textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">—</td>
              <td style={{ fontStyle: 'italic' }}>Opening balance</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{balStr(opening)}</td>
            </tr>
            {rows.map((e, idx) => (
              <tr key={idx}>
                <td>{fmtDate(e.date)}</td>
                <td>{e.description}</td>
                <td style={{ textAlign: 'right' }}>{e.taxable != null ? e.taxable.toFixed(2) : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.tax != null ? e.tax.toFixed(2) : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.dr ? e.dr.toFixed(2) : ''}</td>
                <td style={{ textAlign: 'right' }}>{e.cr ? e.cr.toFixed(2) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{balStr(e.balance)}</td>
              </tr>
            ))}
            <tr style={{ background: 'var(--surface-2, #f8fafc)' }}>
              <td className="muted">—</td>
              <td style={{ fontWeight: 700 }}>Closing balance</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: closing > 0 ? '#15803d' : closing < 0 ? '#dc2626' : 'var(--ink)' }}>{balStr(closing)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ fontWeight: 700 }}>Total</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalTaxable.toFixed(2)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalTax.toFixed(2)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalDr.toFixed(2)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{totalCr.toFixed(2)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800 }}>{balStr(closing)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
