import { useEffect, useState } from 'react';
import type { Item, Outward, Party, PayStatus } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  partyId: '',
  itemId: '',
  qty: '',
  rate: '',
  gstPct: '0',
  freightRate: '0',
  handlingRate: '0',
  handlingAgentId: '',
  payStatus: 'pending' as PayStatus,
  creditDays: '0',
  invNo: '',
  transporterId: '',
  note: '',
};

export function OutwardPage() {
  const can = usePermission();
  const canEdit = can('edit_outward');
  const { selectedFy } = useFinancialYear();
  const { required } = useFieldSettings();
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');

  async function reload() {
    setRows(await api.outward.list({ fy: selectedFy || undefined }));
    api.items.stock().then((levels) => setStock(Object.fromEntries(levels.map((l) => [l.itemId, l.qty]))));
  }

  useEffect(() => {
    api.parties.list('debtor').then(setParties);
    api.items.list().then(setItems);
    api.parties.list('transporter').then(setTransporters);
    api.parties.list('handling').then(setHandlers);
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFy]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Pick up the item's rate, and default credit days from the selected party.
  function onItemChange(id: string) {
    const it = items.find((i) => i.id === id);
    setForm((f) => ({ ...f, itemId: id, rate: f.rate || (it ? String(it.rate) : '') }));
  }
  function onPartyChange(id: string) {
    const p = parties.find((x) => x.id === id);
    const creditDays = p ? (p.creditDays ?? 0) : 0;
    setForm((f) => ({
      ...f,
      partyId: id,
      creditDays: p ? String(creditDays) : f.creditDays,
      // If the party is on credit terms, default Pay Status to Credit (not Pending).
      payStatus: p ? (creditDays > 0 ? 'credit' : 'pending') : f.payStatus,
      // Pre-fill freight from the party's saved Default Freight (editable afterwards).
      freightRate: p ? String(p.defaultFreight ?? 0) : f.freightRate,
    }));
  }

  const qtyN = Number(form.qty) || 0;
  const rateN = Number(form.rate) || 0;
  const gstN = Number(form.gstPct) || 0;
  const goods = qtyN * rateN;
  const amountPreview = goods + (goods * gstN) / 100;

  async function onAdd() {
    setError('');
    if (!form.partyId || !form.itemId || !form.qty || !form.rate) return;
    if (required('outward.invNo') && !form.invNo.trim()) return setError('Invoice number is required.');
    if (required('outward.transporter') && !form.transporterId) return setError('Transporter is required.');
    if (required('outward.handlingAgent') && !form.handlingAgentId) return setError('Handling agent is required.');
    if (required('outward.note') && !form.note.trim()) return setError('Note is required.');
    try {
      await api.outward.create({
        date: form.date,
        partyId: form.partyId,
        itemId: form.itemId,
        qty: Number(form.qty),
        rate: Number(form.rate),
        gstPct: Number(form.gstPct) || 0,
        freightRate: Number(form.freightRate) || 0,
        handlingRate: Number(form.handlingRate) || 0,
        handlingAgentId: form.handlingAgentId || null,
        payStatus: form.payStatus,
        creditDays: Number(form.creditDays) || 0,
        invNo: form.invNo.trim() || null,
        transporterId: form.transporterId || null,
        note: form.note.trim() || null,
      });
      setForm((f) => ({ ...EMPTY, date: f.date }));
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add outward entry');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this outward entry?')) return;
    await api.outward.remove(id);
    reload();
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Outward</h2>
      {canEdit && (
        <>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Party (debtor)</label>
              <select value={form.partyId} onChange={(e) => onPartyChange(e.target.value)}>
                <option value="">Select…</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Item</label>
              <select value={form.itemId} onChange={(e) => onItemChange(e.target.value)}>
                <option value="">Select…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              {form.itemId && (() => {
                const it = items.find((i) => i.id === form.itemId);
                const avail = stock[form.itemId] ?? 0;
                const short = qtyN > 0 && qtyN > avail;
                return (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11.5,
                      fontWeight: 700,
                      display: 'inline-block',
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: short ? '#fef2f2' : '#f0fdf4',
                      color: short ? '#dc2626' : '#15803d',
                      border: `1px solid ${short ? '#fecaca' : '#bbf7d0'}`,
                    }}
                  >
                    Live stock: {avail} {it?.unit || ''}
                    {short ? ' · not enough!' : ''}
                  </div>
                );
              })()}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Qty</label>
              <input value={form.qty} onChange={(e) => set('qty', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Rate</label>
              <input value={form.rate} onChange={(e) => set('rate', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>GST %</label>
              <input value={form.gstPct} onChange={(e) => set('gstPct', e.target.value)} style={{ width: 70 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Pay Status</label>
              <select value={form.payStatus} onChange={(e) => set('payStatus', e.target.value)}>
                <option value="pending">Pending</option>
                <option value="received">Received</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Credit Days</label>
              <input value={form.creditDays} onChange={(e) => set('creditDays', e.target.value)} style={{ width: 90 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('outward.invNo')}>Invoice No.</FieldLabel>
              <input value={form.invNo} onChange={(e) => set('invNo', e.target.value)} style={{ width: 120 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('outward.transporter')}>Transporter</FieldLabel>
              <select value={form.transporterId} onChange={(e) => set('transporterId', e.target.value)}>
                <option value="">— none —</option>
                {transporters.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Freight (₹/unit)</label>
              <input value={form.freightRate} onChange={(e) => set('freightRate', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('outward.handlingAgent')}>Handling Agent</FieldLabel>
              <select value={form.handlingAgentId} onChange={(e) => set('handlingAgentId', e.target.value)}>
                <option value="">— none —</option>
                {handlers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Handling (₹/MT)</label>
              <input value={form.handlingRate} onChange={(e) => set('handlingRate', e.target.value)} style={{ width: 100 }} />
            </div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
              <FieldLabel required={required('outward.note')}>Note</FieldLabel>
              <input value={form.note} onChange={(e) => set('note', e.target.value)} />
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 4, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={onAdd}>
              Add Outward
            </button>
            <span className="muted">
              Goods value ₹{goods.toFixed(2)} · with GST ₹{amountPreview.toFixed(2)}
            </span>
          </div>
        </>
      )}
      {error && <div className="login-err show">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Party</th>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>GST</th>
            <th>Freight</th>
            <th>Handling</th>
            <th>Inv No.</th>
            <th>Amount</th>
            <th>Pay Status</th>
            {canEdit && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.date}</td>
              <td>{partyName(r.partyId)}</td>
              <td>{itemName(r.itemId)}</td>
              <td>{r.qty}</td>
              <td>{r.rate}</td>
              <td>{r.gst}</td>
              <td>{r.freight}</td>
              <td>{r.handling}</td>
              <td>{r.invNo || '—'}</td>
              <td>{r.amount}</td>
              <td>{r.payStatus}</td>
              {canEdit && (
                <td>
                  <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="muted">
                No outward entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
