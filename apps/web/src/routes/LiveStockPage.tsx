import { fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Item, StockLevel } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function LiveStockPage() {
  const can = usePermission();
  const canEdit = can('edit_rate');
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function reload() {
    const [its, levels] = await Promise.all([api.items.list(), api.items.stock()]);
    setItems(its);
    setStock(Object.fromEntries(levels.map((l: StockLevel) => [l.itemId, l.qty])));
  }

  useEffect(() => {
    reload();
  }, []);

  async function onUpdateRate(id: string) {
    const raw = rateEdits[id];
    if (raw === undefined || raw === '') return;
    setError('');
    try {
      await api.items.update(id, { rate: Number(raw) || 0, rateDate: new Date().toISOString().slice(0, 10) });
      setRateEdits((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update rate');
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Live Stock &amp; Rate</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Live stock = opening + total inward − total outward (cancelled orders excluded). Rows in red are at or
        below their reorder level.
      </p>
      {error && <div className="login-err show">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Unit</th>
            <th>Live Stock</th>
            <th>Reorder Level</th>
            <th>Current Rate</th>
            <th>Rate Updated</th>
            <th></th>
            {canEdit && <th>Update Rate</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const qty = stock[i.id] ?? 0;
            const low = i.reorder > 0 && qty <= i.reorder;
            return (
              <tr key={i.id} style={low ? { background: 'rgba(239,68,68,0.10)' } : undefined}>
                <td>
                  {i.name}
                  {low && <span style={{ color: '#ef4444', fontWeight: 700, marginLeft: 6 }}>• low</span>}
                </td>
                <td>{i.unit}</td>
                <td style={{ fontWeight: 700 }}>{qty}</td>
                <td>{i.reorder}</td>
                <td>{fmtAmount(i.rate)}</td>
                <td className="muted">{i.rateDate ? new Date(i.rateDate).toLocaleDateString('en-IN') : '—'}</td>
                <td>
                  <Link to={`/items/${i.id}/ledger`}>View Ledger</Link>
                </td>
                {canEdit && (
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={rateEdits[i.id] ?? ''}
                        onChange={(e) => setRateEdits((r) => ({ ...r, [i.id]: e.target.value }))}
                        placeholder={String(i.rate)}
                        style={{ width: 90 }}
                      />
                      <button className="btn btn-sm btn-primary" onClick={() => onUpdateRate(i.id)}>
                        Save
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 8 : 7} className="muted">
                No items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
