import { Fragment, useEffect, useState } from 'react';
import type { DeliveryType, Inward, Item, Party } from '@surani/shared';
import { fyOfDate } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';
import { useAuth } from '../context/AuthContext';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { SearchSelect } from '../components/SearchSelect';

// The Indian GST slabs, same list the New Order form offers. Imports are picked from this rather
// than typed — an import is usually 0, but customs can land it on any slab.
const GST_SLABS = ['0', '5', '12', '18', '28'];

const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  partyId: '',
  itemId: '',
  qty: '',
  rate: '',
  gstPct: '18',
  handlingRate: '0',
  handlingAgentId: '',
  invNo: '',
  invDate: new Date().toISOString().slice(0, 10),
  deliveryType: '' as '' | DeliveryType,
  transporterId: '',
  freightRate: '0',
  vehicle: '',
  note: '',
};

export function InwardPage() {
  const can = usePermission();
  const { confirm } = useDialogs();
  const { user } = useAuth();
  const canDelete = can('delete_inward');
  const canEdit = can('add_inward') || can('edit_inward') || canDelete;
  const canEditInvoice = user?.role === 'superadmin' || user?.role === 'admin';
  const { selectedFy, setSelectedFy } = useFinancialYear();
  const { required } = useFieldSettings();
  const [rows, setRows] = useState<Inward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState('');

  // Inline edit (admin / superadmin only) — for correcting an inward entry.
  const [editing, setEditing] = useState<Inward | null>(null);
  const [ed, setEd] = useState({
    date: '', partyId: '', itemId: '', invNo: '', invDate: '', qty: '', rate: '', gstPct: '',
    deliveryType: '' as '' | DeliveryType, transporterId: '', freightRate: '',
    handlingAgentId: '', handlingRate: '', vehicle: '', note: '',
  });

  function openEdit(r: Inward) {
    setMarking(null); // only one inline panel open at a time
    setError('');
    setEditing(r);
    setEd({
      date: r.date,
      partyId: r.partyId,
      itemId: r.itemId,
      invNo: r.invNo || '',
      invDate: r.invDate || '',
      qty: String(r.qty),
      rate: String(r.rate),
      gstPct: String(r.gstPct),
      deliveryType: (r.deliveryType || '') as '' | DeliveryType,
      transporterId: r.transporterId || '',
      freightRate: String(r.freightRate ?? 0),
      handlingAgentId: r.handlingAgentId || '',
      handlingRate: String(r.handlingRate ?? 0),
      vehicle: r.vehicle || '',
      note: r.note || '',
    });
  }

  async function confirmEdit() {
    if (!editing) return;
    setError('');
    try {
      await api.inward.update(editing.id, {
        date: ed.date,
        partyId: ed.partyId,
        itemId: ed.itemId,
        invNo: ed.invNo.trim() || null,
        invDate: ed.invDate || null,
        qty: Number(ed.qty),
        rate: Number(ed.rate),
        gstPct: Number(ed.gstPct) || 0,
        deliveryType: ed.deliveryType || null,
        transporterId: ed.transporterId || null,
        freightRate: Number(ed.freightRate) || 0,
        handlingAgentId: ed.handlingAgentId || null,
        handlingRate: Number(ed.handlingRate) || 0,
        vehicle: ed.vehicle.trim() || null,
        note: ed.note.trim() || null,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit inward entry');
    }
  }

  async function reload() {
    setRows(await api.inward.list({ fy: selectedFy || undefined }));
  }

  useEffect(() => {
    api.parties.list('creditor').then(setParties);
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

  // Buying from an importer is an import purchase: the overseas supplier charges no Indian GST
  // (IGST is paid separately at customs), so the item's slab must not be forced on the entry.
  const isImporterParty = (partyId: string) => parties.find((p) => p.id === partyId)?.type === 'importer';
  const importing = isImporterParty(form.partyId);

  // One supplier invoice can carry several items. Party, date, delivery and transport are entered
  // once; each line becomes its own entry, which is the shape stock and the ledgers already read.
  type Line = { itemId: string; qty: string; rate: string; gstPct: string };
  const BLANK_LINE: Line = { itemId: '', qty: '', rate: '', gstPct: '18' };
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

  // Auto-fill the item's rate when an item is chosen and no rate typed yet.
  function onItemChange(i: number, id: string) {
    const it = items.find((x) => x.id === id);
    setLines((ls) =>
      ls.map((l, j) =>
        j === i
          ? {
              ...l,
              itemId: id,
              rate: l.rate || (it ? String(it.rate) : ''),
              // GST is fixed to the item's slab (set in Item Master) — except on imports, where
              // the slab does not apply and the figure stays editable.
              gstPct: it && !importing ? String(it.gstPct ?? 0) : l.gstPct,
            }
          : l
      )
    );
  }

  // Switching to an importer clears the slab-derived GST on every line; switching away restores it.
  function onPartyChange(id: string) {
    const toImporter = isImporterParty(id);
    setForm((f) => ({ ...f, partyId: id }));
    setLines((ls) =>
      ls.map((l) => {
        const it = items.find((x) => x.id === l.itemId);
        return { ...l, gstPct: toImporter ? '0' : it ? String(it.gstPct ?? 0) : l.gstPct };
      })
    );
  }

  const lineTotals = lines.map((l) => {
    const goods = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    return { goods, withGst: goods + (goods * (Number(l.gstPct) || 0)) / 100 };
  });
  const goods = lineTotals.reduce((s, t) => s + t.goods, 0);
  const amountPreview = lineTotals.reduce((s, t) => s + t.withGst, 0);
  const filledLines = lines.filter((l) => l.itemId && l.qty && l.rate);
  const totalQty = filledLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const freightN = Number(form.freightRate) || 0;
  const freightTotal = freightN * totalQty;

  // Step 1: record the goods as a Pending inward. Invoice no./date + handling are captured
  // later in the "Mark as Inward" step, so they aren't required (or shown) here.
  async function onAdd() {
    setError('');
    if (!form.partyId) return setError('Select a party.');
    if (filledLines.length === 0) return setError('Add at least one item, with a quantity and rate.');
    // A half-filled line is more likely a mistake than an intention, so say so rather than skip it.
    const partial = lines.findIndex((l) => (l.itemId || l.qty || l.rate) && !(l.itemId && l.qty && l.rate));
    if (partial >= 0) return setError(`Item ${partial + 1} is incomplete — it needs an item, quantity and rate.`);
    if (required('inward.deliveryType') && !form.deliveryType) return setError('Delivery type is required.');
    if (required('inward.transporter') && !form.transporterId) return setError('Transporter is required.');
    if (required('inward.vehicle') && !form.vehicle.trim()) return setError('Vehicle / LR no. is required.');
    if (required('inward.note') && !form.note.trim()) return setError('Note is required.');
    try {
      // One pending entry per item line, all sharing this purchase's party, date and transport.
      // Each is then marked as inward separately, as its own invoice line would be.
      for (const l of filledLines) {
        await api.inward.create({
          date: form.date,
          partyId: form.partyId,
          itemId: l.itemId,
          qty: Number(l.qty),
          rate: Number(l.rate),
          gstPct: Number(l.gstPct) || 0,
          deliveryType: form.deliveryType || null,
          transporterId: form.transporterId || null,
          freightRate: Number(form.freightRate) || 0,
          vehicle: form.vehicle.trim() || null,
          note: form.note.trim() || null,
        });
      }
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setLines([{ ...BLANK_LINE }]);
      // If the entry is dated in a different financial year, switch to it so it stays visible.
      const efy = fyOfDate(form.date);
      if (efy && efy !== selectedFy) setSelectedFy(efy);
      else reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add inward entry');
    }
  }

  // Step 2: "Mark as Inward" — enter invoice no./date + handling charges, then finalize.
  const [marking, setMarking] = useState<Inward | null>(null);
  const [mk, setMk] = useState({ invNo: '', invDate: '', handlingAgentId: '', handlingRate: '0' });

  function openMark(r: Inward) {
    setEditing(null); // only one inline panel open at a time
    setError('');
    setMarking(r);
    setMk({
      invNo: r.invNo || '',
      invDate: r.invDate || new Date().toISOString().slice(0, 10),
      handlingAgentId: r.handlingAgentId || '',
      handlingRate: String(r.handlingRate ?? 0),
    });
  }

  async function confirmMark() {
    if (!marking) return;
    setError('');
    if (required('inward.invNo') && !mk.invNo.trim()) return setError('Invoice number is required.');
    if (required('inward.invDate') && !mk.invDate) return setError('Invoice date is required.');
    if (required('inward.handlingAgent') && !mk.handlingAgentId) return setError('Handling agent is required.');
    try {
      await api.inward.mark(marking.id, {
        invNo: mk.invNo.trim() || null,
        invDate: mk.invDate || null,
        handlingAgentId: mk.handlingAgentId || null,
        handlingRate: Number(mk.handlingRate) || 0,
      });
      setMarking(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as inward');
    }
  }

  async function onDelete(id: string) {
    if (!(await confirm('Delete this inward entry?', { okLabel: 'Delete', danger: true }))) return;
    await api.inward.remove(id);
    reload();
  }

  const pendingRows = rows.filter((r) => r.status === 'pending');
  const receivedRows = rows.filter((r) => r.status !== 'pending');

  const headerCells = (
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
      {canEdit && <th></th>}
    </tr>
  );

  const colCount = canEdit ? 11 : 10;

  // A row, plus — when it is the row being edited or marked — the matching panel rendered
  // directly beneath it, so the form opens where you clicked (same as Party Master).
  function inwardRow(r: Inward) {
    return (
      <Fragment key={r.id}>
        {inwardCells(r)}
        {editing?.id === r.id && canEditInvoice && (
          <tr>
            <td colSpan={colCount} style={{ background: '#f8fafc' }}>
              {editPanel(r)}
            </td>
          </tr>
        )}
        {marking?.id === r.id && (
          <tr>
            <td colSpan={colCount} style={{ background: '#f8fafc' }}>
              {markPanel(r)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  function inwardCells(r: Inward) {
    return (
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
        {canEdit && (
          <td>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {r.status === 'pending' && (
                <button className="btn btn-sm btn-primary" onClick={() => openMark(r)} title="Enter invoice & handling, then finalize">
                  Mark as Inward
                </button>
              )}
              {canEditInvoice && (
                <button className="btn btn-sm" onClick={() => (editing?.id === r.id ? setEditing(null) : openEdit(r))} title="Edit entry (admin only)">
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
    );
  }

  function editPanel(r: Inward) {
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
          Edit Inward — {partyName(r.partyId)} · {itemName(r.itemId)}
        </div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label>Date</label>
            <input type="date" value={ed.date} onChange={(e) => setEd({ ...ed, date: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
            <label>Party (creditor)</label>
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
            {isImporterParty(ed.partyId) ? (
              <select value={ed.gstPct} onChange={(e) => setEd({ ...ed, gstPct: e.target.value })} style={{ width: 90 }}>
                {/* Keep an off-slab saved value selectable, so opening the form can't silently
                    round it to the nearest slab. */}
                {(GST_SLABS.includes(ed.gstPct) ? GST_SLABS : [...GST_SLABS, ed.gstPct]).map((g) => (
                  <option key={g} value={g}>{g}%</option>
                ))}
              </select>
            ) : (
              <input value={ed.gstPct} onChange={(e) => setEd({ ...ed, gstPct: e.target.value })} style={{ width: 70 }} />
            )}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice No.</label>
            <input value={ed.invNo} onChange={(e) => setEd({ ...ed, invNo: e.target.value })} style={{ width: 130 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice Date</label>
            <input type="date" value={ed.invDate} onChange={(e) => setEd({ ...ed, invDate: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Delivery</label>
            <select value={ed.deliveryType} onChange={(e) => setEd({ ...ed, deliveryType: e.target.value as '' | DeliveryType })}>
              <option value="">—</option>
              <option value="ExWorks">Ex Works</option>
              <option value="FOR">FOR</option>
            </select>
          </div>
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
          <div className="field" style={{ margin: 0 }}>
            <label>Vehicle</label>
            <input value={ed.vehicle} onChange={(e) => setEd({ ...ed, vehicle: e.target.value })} style={{ width: 120 }} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Note</label>
            <input value={ed.note} onChange={(e) => setEd({ ...ed, note: e.target.value })} />
          </div>
        </div>
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmEdit}>Save Changes</button>
          <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </>
    );
  }

  function markPanel(r: Inward) {
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
          Mark as Inward — {partyName(r.partyId)} · {itemName(r.itemId)}
        </div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <FieldLabel required={required('inward.invNo')}>Invoice No.</FieldLabel>
            <input value={mk.invNo} onChange={(e) => setMk({ ...mk, invNo: e.target.value })} style={{ width: 140 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <FieldLabel required={required('inward.invDate')}>Invoice Date</FieldLabel>
            <input type="date" value={mk.invDate} onChange={(e) => setMk({ ...mk, invDate: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <FieldLabel required={required('inward.handlingAgent')}>Handling Agent</FieldLabel>
            <select value={mk.handlingAgentId} onChange={(e) => setMk({ ...mk, handlingAgentId: e.target.value })}>
              <option value="">— none —</option>
              {handlers.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Handling (₹/MT)</label>
            <input value={mk.handlingRate} onChange={(e) => setMk({ ...mk, handlingRate: e.target.value })} style={{ width: 100 }} />
          </div>
        </div>
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmMark}>Confirm — Mark as Inward</button>
          <button className="btn btn-sm" onClick={() => setMarking(null)}>Cancel</button>
        </div>
      </>
    );
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Inward</h2>
      {canEdit && (
        <>
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>Date</label>
              <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0, flex: 1, minWidth: 240 }}>
              <label>Party (creditor)</label>
              <SearchSelect
                value={form.partyId}
                onChange={onPartyChange}
                options={parties.map((p) => ({ id: p.id, label: p.name }))}
                placeholder="Type party name…"
              />
              {importing && (
                <span className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
                  Importer — GST % is not fixed to the item.
                </span>
              )}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('inward.deliveryType')}>Delivery</FieldLabel>
              <select value={form.deliveryType} onChange={(e) => set('deliveryType', e.target.value)}>
                <option value="">—</option>
                <option value="ExWorks">Ex Works</option>
                <option value="FOR">FOR</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <FieldLabel required={required('inward.transporter')}>Transporter</FieldLabel>
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
              <FieldLabel required={required('inward.vehicle')}>Vehicle</FieldLabel>
              <input value={form.vehicle} onChange={(e) => set('vehicle', e.target.value)} style={{ width: 120 }} />
            </div>
            <div className="field" style={{ margin: 0, width: 160 }}>
              <FieldLabel required={required('inward.note')}>Note</FieldLabel>
              <input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Remarks…" style={{ width: '100%' }} />
            </div>
          </div>
          {/* One invoice, several items. Each line below is saved as its own entry sharing the
              party, date and invoice number above — which is what stock and the ledgers read. */}
          <div style={{ marginTop: 10, border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Items</div>
            {lines.map((l, i) => {
              const it = items.find((x) => x.id === l.itemId);
                                                        const locked = !!it && !importing;
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
                    {importing ? (
                      <select value={l.gstPct} onChange={(e) => setLine(i, { gstPct: e.target.value })} style={{ width: 90 }}>
                        {(GST_SLABS.includes(l.gstPct) ? GST_SLABS : [...GST_SLABS, l.gstPct]).map((g) => (
                          <option key={g} value={g}>{g}%</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={l.gstPct}
                        onChange={(e) => setLine(i, { gstPct: e.target.value })}
                        style={{ width: 70 }}
                        readOnly={locked}
                        title={locked ? "Set automatically from the item's GST slab" : ''}
                      />
                    )}
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
          {filledLines.length > 0 && (
            <div
              style={{
                marginTop: 12,
                maxWidth: 320,
                background: 'var(--surface-2, #f8fafc)',
                border: '1px solid var(--line, #e2e8f0)',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 10 }}>
                Amount Breakdown
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#475569' }}>
                  Goods value ({filledLines.length} item{filledLines.length === 1 ? '' : 's'})
                </span>
                <span>₹{goods.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#475569' }}>GST</span>
                <span>₹{(amountPreview - goods).toFixed(2)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--line, #e2e8f0)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
                <span>Total payable</span>
                <span style={{ color: '#ef4444' }}>₹{amountPreview.toFixed(2)}</span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line, #e2e8f0)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#94a3b8', marginBottom: 6 }}>
                  For reference only (not added above)
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#475569' }}>Transportation ({totalQty} × ₹{freightN})</span>
                  <span>₹{freightTotal.toFixed(2)}</span>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                  Handling charges &amp; invoice details are added in the “Mark as Inward” step.
                </div>
              </div>
            </div>
          )}
          <div className="toolbar" style={{ marginTop: 12, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={onAdd}>
              Save (Pending)
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Records a pending entry. Use “Mark as Inward” below once the goods &amp; invoice arrive.
            </span>
          </div>
        </>
      )}
      {/* Errors raised by the inline panels are shown inside those panels, next to the buttons. */}
      {error && !editing && !marking && <div className="login-err show">{error}</div>}

      {/* Pending — recorded but not yet marked as inward */}
      <div style={{ marginTop: 8 }}>
        <h3 style={{ marginBottom: 8 }}>
          ⏳ Pending Orders <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>— awaiting “Mark as Inward”</span>
          {pendingRows.length > 0 && (
            <span style={{ background: '#c2410c', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10, marginLeft: 8 }}>
              {pendingRows.length}
            </span>
          )}
        </h3>
        <table>
          <thead>{headerCells}</thead>
          <tbody>
            {pendingRows.map(inwardRow)}
            {pendingRows.length === 0 && (
              <tr>
                <td colSpan={11} className="muted">No pending orders.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Received — finalized inward entries */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <h3 style={{ marginBottom: 8 }}>✅ Received Inward <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>— counted in stock &amp; dues</span></h3>
        <table>
          <thead>{headerCells}</thead>
          <tbody>
            {receivedRows.map(inwardRow)}
            {receivedRows.length === 0 && (
              <tr>
                <td colSpan={11} className="muted">No received inward entries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
