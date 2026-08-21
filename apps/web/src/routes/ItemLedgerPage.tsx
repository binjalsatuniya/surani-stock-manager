import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Item, ItemLedgerEntry } from '@surani/shared';
import { api } from '../lib/apiClient';
import { exportItemLedgerPdf } from '../lib/pdfExport';
import { getPdfLayout } from '../lib/pdfLayout';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const qtyStr = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ItemLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [entries, setEntries] = useState<ItemLedgerEntry[]>([]);

  useEffect(() => {
    if (!id) return;
    api.items.list().then((all) => setItem(all.find((i) => i.id === id) ?? null));
    api.ledger.item(id).then(setEntries);
  }, [id]);

  // Opening stock comes from the item itself; purchases add and sales subtract — the same
  // formula Live Stock uses, so the closing figure below always matches that page.
  const opening = Number(item?.opening ?? 0);
  const totalIn = entries.reduce((s, e) => s + e.qtyIn, 0);
  const totalOut = entries.reduce((s, e) => s + e.qtyOut, 0);
  const totalTaxable = entries.reduce((s, e) => s + e.taxable, 0);
  const totalTax = entries.reduce((s, e) => s + e.tax, 0);
  const totalValue = entries.reduce((s, e) => s + e.total, 0);
  const closing = opening + totalIn - totalOut;
  const unit = item?.unit || '';

  // Purchase vs sale value, so the page shows what was bought and sold, not just a net.
  const purchaseValue = entries.filter((e) => e.kind === 'in').reduce((s, e) => s + e.total, 0);
  const saleValue = entries.filter((e) => e.kind === 'out').reduce((s, e) => s + e.total, 0);

  let running = opening;
  const rows = entries.map((e) => {
    running += e.qtyIn - e.qtyOut;
    return { ...e, balance: running };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <div className="toolbar" style={{ alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: 1 }}>Item Ledger — {item?.name || '…'}</h2>
          <button
            className="btn btn-sm btn-primary"
            onClick={async () => exportItemLedgerPdf(item?.name || 'Item', unit, entries, opening, await getPdfLayout())}
          >
            Export PDF
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
          <Stat
            label="Closing stock"
            value={`${qtyStr(closing)} ${unit}`}
            tone={closing > 0 ? 'good' : closing < 0 ? 'bad' : 'plain'}
          />
          <Stat label="Total purchased" value={`${qtyStr(totalIn)} ${unit}`} sub={`₹${money(purchaseValue)}`} />
          <Stat label="Total sold" value={`${qtyStr(totalOut)} ${unit}`} sub={`₹${money(saleValue)}`} />
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Party</th>
              <th style={{ textAlign: 'right' }}>Qty In</th>
              <th style={{ textAlign: 'right' }}>Qty Out</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th style={{ textAlign: 'right' }}>Rate</th>
              <th style={{ textAlign: 'right' }}>Taxable</th>
              <th style={{ textAlign: 'right' }}>GST</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="muted">—</td>
              <td style={{ fontStyle: 'italic' }}>Opening stock</td>
              <td></td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{qtyStr(opening)}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            {rows.map((e, idx) => (
              <tr key={idx}>
                <td>{fmtDate(e.date)}</td>
                <td>{e.description}</td>
                <td>{e.partyName}</td>
                <td style={{ textAlign: 'right', color: '#15803d' }}>{e.qtyIn ? qtyStr(e.qtyIn) : ''}</td>
                <td style={{ textAlign: 'right', color: '#dc2626' }}>{e.qtyOut ? qtyStr(e.qtyOut) : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{qtyStr(e.balance)}</td>
                <td style={{ textAlign: 'right' }}>{money(e.rate)}</td>
                <td style={{ textAlign: 'right' }}>{money(e.taxable)}</td>
                <td style={{ textAlign: 'right' }}>{money(e.tax)}</td>
                <td style={{ textAlign: 'right' }}>{money(e.total)}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">
                  No purchases or sales for this item yet.
                </td>
              </tr>
            )}
            <tr style={{ background: 'var(--surface-2, #f8fafc)' }}>
              <td className="muted">—</td>
              <td style={{ fontWeight: 700 }}>Closing stock</td>
              <td></td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: closing > 0 ? '#15803d' : closing < 0 ? '#dc2626' : 'var(--ink)' }}>
                {qtyStr(closing)} {unit}
              </td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontWeight: 700 }}>Total</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{qtyStr(totalIn)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{qtyStr(totalOut)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800 }}>{qtyStr(closing)}</td>
              <td></td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(totalTaxable)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(totalTax)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800 }}>{money(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = 'plain' }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'plain' }) {
  const colour = tone === 'good' ? '#15803d' : tone === 'bad' ? '#dc2626' : 'var(--ink)';
  return (
    <div
      style={{
        background: tone === 'good' ? '#f0fdf4' : tone === 'bad' ? '#fef2f2' : 'var(--surface-2)',
        border: `1px solid ${tone === 'good' ? '#bbf7d0' : tone === 'bad' ? '#fecaca' : 'var(--line)'}`,
        borderRadius: 10,
        padding: '12px 16px',
        minWidth: 150,
      }}
    >
      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colour }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}
