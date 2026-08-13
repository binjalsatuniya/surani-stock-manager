import { Fragment, useEffect, useState } from 'react';
import type { Item, Outward, Party, PayStatus } from '@surani/shared';
import { fyOfDate } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { SearchSelect } from '../components/SearchSelect';

// The item, quantity, rate and GST now live on the item lines below, not here — one invoice can
// carry several of them, while everything in this object is entered once and shared.
const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  partyId: '',
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
  const { confirm } = useDialogs();
  const canDelete = can('delete_outward');
  const canEditRow = can('edit_outward');
  const canEdit = can('add_outward') || canEditRow || canDelete;
  const { selectedFy, setSelectedFy } = useFinancialYear();
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

  // One invoice can carry several items. Party, date, invoice number, transport and payment are
  // entered once; each line below becomes its own entry sharing them, which is the shape stock and
  // the ledgers already read.
  type Line = { itemId: string; qty: string; rate: string; gstPct: string };
  const BLANK_LINE: Line = { itemId: '', qty: '', rate: '', gstPct: '0' };
  const [lines, setLines] = useState<Line[]>([{ ...BLANK_LINE }]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { ...BLANK_LINE }]);
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, j) => j !== i)));
  }

  // Pick up the item's rate and GST slab when an item is chosen on a line.
  function onItemChange(i: number, id: string) {
    const it = items.find((x) => x.id === id);
    setLines((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              itemId: id,
              rate: l.rate || (it ? String(it.rate) : ''),
              gstPct: it && Number(it.gstPct) > 0 ? String(it.gstPct) : l.gstPct,
            }
          : l
      )
    );
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

  const lineTotals = lines.map((l) => {
    const goods = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    return { goods, withGst: goods + (goods * (Number(l.gstPct) || 0)) / 100 };
  });
  const goods = lineTotals.reduce((s, t) => s + t.goods, 0);
  const amountPreview = lineTotals.reduce((s, t) => s + t.withGst, 0);
  const filledLines = lines.filter((l) => l.itemId && l.qty && l.rate);

  async function onAdd() {
    setError('');
    if (!form.partyId) return setError('Select a party.');
    if (filledLines.length === 0) return setError('Add at least one item, with a quantity and rate.');
    // A half-filled line is more likely a mistake than an intention, so say so rather than skip it.
    const partial = lines.findIndex((l) => (l.itemId || l.qty || l.rate) && !(l.itemId && l.qty && l.rate));
    if (partial >= 0) return setError(`Item ${partial + 1} is incomplete — it needs an item, quantity and rate.`);
    if (required('outward.invNo') && !form.invNo.trim()) return setError('Invoice number is required.');
    if (required('outward.transporter') && !form.transporterId) return setError('Transporter is required.');
    if (required('outward.handlingAgent') && !form.handlingAgentId) return setError('Handling agent is required.');
    if (required('outward.note') && !form.note.trim()) return setError('Note is required.');
    try {
      // One entry per item line, all sharing this invoice's party, date, invoice number and terms.
      // Freight and handling are per unit and per tonne, so each line carries its own rates and is
      // costed on its own quantity — putting the whole freight on one line would misstate both.
      for (const l of filledLines) {
        await api.outward.create({
          date: form.date,
          partyId: form.partyId,
          itemId: l.itemId,
          qty: Number(l.qty),
          rate: Number(l.rate),
          gstPct: Number(l.gstPct) || 0,
          freightRate: Number(form.freightRate) || 0,
          handlingRate: Number(form.handlingRate) || 0,
          handlingAgentId: form.handlingAgentId || null,
          payStatus: form.payStatus,
          creditDays: Number(form.creditDays) || 0,
          invNo: form.invNo.trim() || null,
          transporterId: form.transporterId || null,
          note: form.note.trim() || null,
        });
      }
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setLines([{ ...BLANK_LINE }]);
      const efy = fyOfDate(form.date);
      if (efy && efy !== selectedFy) setSelectedFy(efy);
      else reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add outward entry');
    }
  }

  async function onDelete(id: string) {
    if (!(await confirm('Delete this outward entry?', { okLabel: 'Delete', danger: true }))) return;
    await api.outward.remove(id);
    reload();
  }

  // Inline edit — opens directly under the row being corrected (same as Party Master).
  const [editing, setEditing] = useState<Outward | null>(null);
  const [ed, setEd] = useState({
    date: '', partyId: '', itemId: '', qty: '', rate: '', gstPct: '',
    payStatus: 'pending' as PayStatus, creditDays: '', invNo: '', invDate: '', note: '',
    freightRate: '', transporterId: '', handlingRate: '', handlingAgentId: '',
  });
  // Freight and handling feed the transporter's and agent's ledgers, so they are separately granted.
  const canEditFreight = can('edit_outward_freight');

  function openEdit(r: Outward) {
    setError('');
    setEditing(r);
    setEd({
      date: r.date,
      partyId: r.partyId,
      itemId: r.itemId,
      qty: String(r.qty),
      rate: String(r.rate),
      gstPct: String(r.gstPct),
      payStatus: r.payStatus,
      creditDays: String(r.creditDays ?? 0),
      invNo: r.invNo || '',
      invDate: r.invDate || '',
      note: r.note || '',
      freightRate: String(r.freightRate ?? 0),
      transporterId: r.transporterId || '',
      handlingRate: String(r.handlingRate ?? 0),
      handlingAgentId: r.handlingAgentId || '',
    });
  }

  async function confirmEdit() {
    if (!editing) return;
    setError('');
    try {
      await api.outward.update(editing.id, {
        date: ed.date,
        partyId: ed.partyId,
        itemId: ed.itemId,
        qty: Number(ed.qty),
        rate: Number(ed.rate),
        gstPct: Number(ed.gstPct) || 0,
        payStatus: ed.payStatus,
        creditDays: Number(ed.creditDays) || 0,
        invNo: ed.invNo.trim() || null,
        invDate: ed.invDate || null,
        note: ed.note.trim() || null,
        // Only sent when allowed — the server refuses these fields without the permission.
        ...(canEditFreight
          ? {
              freightRate: Number(ed.freightRate) || 0,
              transporterId: ed.transporterId || null,
              handlingRate: Number(ed.handlingRate) || 0,
              handlingAgentId: ed.handlingAgentId || null,
            }
          : {}),
      });
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit outward entry');
    }
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  function editPanel(r: Outward) {
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
          Edit Outward — {partyName(r.partyId)} · {itemName(r.itemId)}
        </div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label>Date</label>
            <input type="date" value={ed.date} onChange={(e) => setEd({ ...ed, date: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
            <label>Party (debtor)</label>
            <SearchSelect
              value={ed.partyId}
              onChange={(id) => setEd({ ...ed, partyId: id })}
              options={parties.map((p) => ({ id: p.id, label: p.name }))}
              placeholder="Type party name…"
              allowClear={false}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Item</label>
            <select value={ed.itemId} onChange={(e) => setEd({ ...ed, itemId: e.target.value })}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Qty</label>
            <input value={ed.qty} onChange={(e) => setEd({ ...ed, qty: e.target.value })} style={{ width: 90 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Rate</label>
            <input value={ed.rate} onChange={(e) => setEd({ ...ed, rate: e.target.value })} style={{ width: 90 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>GST %</label>
            <input value={ed.gstPct} onChange={(e) => setEd({ ...ed, gstPct: e.target.value })} style={{ width: 70 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Pay Status</label>
            <select value={ed.payStatus} onChange={(e) => setEd({ ...ed, payStatus: e.target.value as PayStatus })}>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Credit Days</label>
            <input value={ed.creditDays} onChange={(e) => setEd({ ...ed, creditDays: e.target.value })} style={{ width: 90 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice No.</label>
            <input value={ed.invNo} onChange={(e) => setEd({ ...ed, invNo: e.target.value })} style={{ width: 130 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice Date</label>
            <input type="date" value={ed.invDate} onChange={(e) => setEd({ ...ed, invDate: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Note</label>
            <input value={ed.note} onChange={(e) => setEd({ ...ed, note: e.target.value })} />
          </div>
        </div>
        {canEditFreight ? (
          <>
            <div className="toolbar" style={{ marginTop: 4 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Transporter</label>
                <select value={ed.transporterId} onChange={(e) => setEd({ ...ed, transporterId: e.target.value })}>
                  <option value="">— none —</option>
                  {transporters.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Freight (₹/unit)</label>
                <input value={ed.freightRate} onChange={(e) => setEd({ ...ed, freightRate: e.target.value })} style={{ width: 100 }} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Handling Agent</label>
                <select value={ed.handlingAgentId} onChange={(e) => setEd({ ...ed, handlingAgentId: e.target.value })}>
                  <option value="">— none —</option>
                  {handlers.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Handling (₹/MT)</label>
                <input value={ed.handlingRate} onChange={(e) => setEd({ ...ed, handlingRate: e.target.value })} style={{ width: 100 }} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Saving re-posts this entry's freight and handling into the transporter's and agent's
              ledgers. Both are recalculated from the quantity above.
            </div>
          </>
        ) : (
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Freight, handling and transporter are not editable with your permissions.
          </div>
        )}
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmEdit}>Save Changes</button>
          <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </>
    );
  }

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
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
              <label>Party (debtor)</label>
              <SearchSelect
                value={form.partyId}
                onChange={onPartyChange}
                options={parties.map((p) => ({ id: p.id, label: p.name }))}
                placeholder="Type party name…"
              />
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
            <div className="field" style={{ margin: 0, width: 160 }}>
              <FieldLabel required={required('outward.note')}>Note</FieldLabel>
              <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Remarks…" style={{ width: '100%' }} />
            </div>
          </div>
          {/* One invoice, several items. Each line below is saved as its own entry sharing the
              party, date and invoice number above — which is what stock and the ledgers read. */}
          <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Items</div>
            {lines.map((l, i) => {
              const it = items.find((x) => x.id === l.itemId);
              const avail = l.itemId ? stock[l.itemId] ?? 0 : 0;
              const q = Number(l.qty) || 0;
              const short = q > 0 && q > avail;
              const locked = !!it && Number(it.gstPct) > 0;
              return (
                <div key={i} className="toolbar" style={{ alignItems: 'flex-end', marginBottom: 6 }}>
                  <div className="field" style={{ margin: 0, minWidth: 30 }}>
                    <label>#</label>
                    <div style={{ fontSize: 13, paddingTop: 6 }}>{i + 1}</div>
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Item</label>
                    <select value={l.itemId} onChange={(e) => onItemChange(i, e.target.value)}>
                      <option value="">Select…</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    {l.itemId && (
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
                    )}
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Qty</label>
                    <input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} style={{ width: 90 }} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Rate</label>
                    <input value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} style={{ width: 90 }} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>GST %</label>
                    <input
                      value={l.gstPct}
                      onChange={(e) => setLine(i, { gstPct: e.target.value })}
                      style={{ width: 70 }}
                      readOnly={locked}
                      title={locked ? "Set automatically from the item's GST slab" : ''}
                    />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Amount</label>
                    <div style={{ fontSize: 13, paddingTop: 6, whiteSpace: 'nowrap' }}>
                      ₹{lineTotals[i].withGst.toFixed(2)}
                    </div>
                  </div>
                  {lines.length > 1 && (
                    <button className="btn btn-sm btn-danger" onClick={() => removeLine(i)} title="Remove this item">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button className="btn btn-sm" onClick={addLine}>
              + Add item
            </button>
          </div>
          <div className="toolbar" style={{ marginTop: 4, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={onAdd}>
              Add Outward
            </button>
            <span className="muted">
              {filledLines.length} item{filledLines.length === 1 ? '' : 's'} · goods ₹{goods.toFixed(2)} · with
              GST ₹{amountPreview.toFixed(2)}
              {filledLines.length > 1 && ' — saved as one entry per item, sharing this invoice number'}
            </span>
          </div>
        </>
      )}
      {/* While an inline panel is open its own error is shown next to its buttons. */}
      {error && !editing && <div className="login-err show">{error}</div>}
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
            <Fragment key={r.id}>
              <tr>
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canEditRow && (
                        <button className="btn btn-sm" onClick={() => (editing?.id === r.id ? setEditing(null) : openEdit(r))}>
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button className="btn btn-sm btn-danger" onClick={() => onDelete(r.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              {editing?.id === r.id && (
                <tr>
                  <td colSpan={canEdit ? 12 : 11} style={{ background: '#f8fafc' }}>
                    {editPanel(r)}
                  </td>
                </tr>
              )}
            </Fragment>
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
