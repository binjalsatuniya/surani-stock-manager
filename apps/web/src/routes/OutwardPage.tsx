import { Fragment, useEffect, useState, type ChangeEvent } from 'react';
import type { Item, Outward, Party, PayStatus } from '@surani/shared';
import { fyOfDate } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';
import { useFinancialYear } from '../context/FinancialYearContext';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { FieldLabel } from '../components/FieldLabel';
import { SearchSelect } from '../components/SearchSelect';
import { openDataUrlInNewTab } from '../lib/dataUrl';

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
  // The last column also carries the "Invoice" view button, so it must appear for a view-only user
  // who can see invoices even when they cannot edit rows.
  const showActions = canEdit || can('view_invoice');
  const { selectedFy, setSelectedFy } = useFinancialYear();
  const { required } = useFieldSettings();
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ ...EMPTY });
  // Filter the list below by invoice number and/or a date range (matches the entry date or, when
  // present, the invoice date). Opened with the Filter button so it stays out of the way.
  const [showFilter, setShowFilter] = useState(false);
  const [fInvNo, setFInvNo] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [error, setError] = useState('');
  const canViewInvoice = can('view_invoice');
  // Invoice scan for the entry being added. One file is shared by every item line on the invoice.
  const [invoiceFile, setInvoiceFile] = useState<string | null>(null);
  const [invoiceName, setInvoiceName] = useState('');

  function onPickInvoice(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Invoice file is too large (max 5 MB).');
    const reader = new FileReader();
    reader.onload = () => {
      setInvoiceFile(String(reader.result));
      setInvoiceName(file.name);
    };
    reader.readAsDataURL(file);
  }

  // Fetch the invoice on demand (the list omits the blob) and open it in a new tab.
  async function openInvoice(id: string) {
    try {
      const res = await api.outward.getInvoice(id);
      if (!res.invoiceFile || !openDataUrlInNewTab(res.invoiceFile)) {
        setError('No invoice file is attached, or it could not be read.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the invoice');
    }
  }

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
          // The same invoice covers every item line, so each row carries a copy.
          invoiceFile: invoiceFile || undefined,
          invoiceFileName: invoiceFile ? invoiceName || undefined : undefined,
        });
      }
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setLines([{ ...BLANK_LINE }]);
      setInvoiceFile(null);
      setInvoiceName('');
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
  // A replacement invoice picked in the edit panel. Empty = keep whatever is already attached.
  const [edInvoiceFile, setEdInvoiceFile] = useState<string | null>(null);
  const [edInvoiceName, setEdInvoiceName] = useState('');

  function onPickEditInvoice(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError('Invoice file is too large (max 5 MB).');
    const reader = new FileReader();
    reader.onload = () => {
      setEdInvoiceFile(String(reader.result));
      setEdInvoiceName(file.name);
    };
    reader.readAsDataURL(file);
  }

  function openEdit(r: Outward) {
    setError('');
    setEditing(r);
    setEdInvoiceFile(null);
    setEdInvoiceName('');
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
        // Only sent when a new file was picked; omitting keeps the current one.
        ...(edInvoiceFile ? { invoiceFile: edInvoiceFile, invoiceFileName: edInvoiceName || undefined } : {}),
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
        <div className="toolbar" style={{ marginTop: 4, alignItems: 'center' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice (PDF or image)</label>
            <input type="file" accept="application/pdf,image/*" onChange={onPickEditInvoice} />
          </div>
          {edInvoiceName ? (
            <span className="muted" style={{ fontSize: 12 }}>New file: {edInvoiceName}</span>
          ) : r.invoiceFileName ? (
            <span className="muted" style={{ fontSize: 12 }}>
              Attached: {r.invoiceFileName}
              {canViewInvoice && (
                <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => openInvoice(r.id)}>
                  View
                </button>
              )}
            </span>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>No invoice attached.</span>
          )}
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

  const filterActive = !!(fInvNo.trim() || fFrom || fTo);
  const dOnly = (s: string | null | undefined) => (s || '').slice(0, 10);
  const inRange = (d: string | null | undefined) => {
    const x = dOnly(d);
    if (!x) return false;
    if (fFrom && x < fFrom) return false;
    if (fTo && x > fTo) return false;
    return true;
  };
  const visibleRows = rows.filter((r) => {
    if (fInvNo.trim() && !(r.invNo || '').toLowerCase().includes(fInvNo.trim().toLowerCase())) return false;
    // Match the range against the entry date OR the invoice date, so either one the user has in mind works.
    if ((fFrom || fTo) && !(inRange(r.date) || inRange(r.invDate))) return false;
    return true;
  });
  function clearFilter() {
    setFInvNo('');
    setFFrom('');
    setFTo('');
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
                <div key={i} className="toolbar" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
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
          <div className="toolbar" style={{ marginTop: 8, alignItems: 'center' }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Invoice (PDF or image)</label>
              <input type="file" accept="application/pdf,image/*" onChange={onPickInvoice} />
            </div>
            {invoiceName && (
              <span className="muted" style={{ fontSize: 12 }}>
                Attached: {invoiceName}
                <button
                  className="btn btn-sm"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setInvoiceFile(null);
                    setInvoiceName('');
                  }}
                >
                  Remove
                </button>
              </span>
            )}
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

      <div className="toolbar" style={{ marginTop: 8, marginBottom: 8, alignItems: 'flex-end' }}>
        <button className="btn btn-sm" onClick={() => setShowFilter((s) => !s)}>
          {showFilter ? 'Hide Filter' : 'Filter'}{filterActive ? ' ●' : ''}
        </button>
        {showFilter && (
          <>
            <div className="field" style={{ margin: 0 }}>
              <label>Invoice No.</label>
              <input value={fInvNo} onChange={(e) => setFInvNo(e.target.value)} placeholder="Invoice number…" style={{ width: 160 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>From date</label>
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>To date</label>
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>
            {filterActive && (
              <button className="btn btn-sm" onClick={clearFilter}>Clear</button>
            )}
            <span className="muted" style={{ fontSize: 12 }}>
              Showing {visibleRows.length} of {rows.length}
            </span>
          </>
        )}
      </div>

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
            {showActions && <th></th>}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
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
                {showActions && (
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.invoiceFileName && canViewInvoice && (
                        <button className="btn btn-sm" onClick={() => openInvoice(r.id)} title="View the attached invoice">
                          Invoice
                        </button>
                      )}
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
                  <td colSpan={showActions ? 12 : 11} style={{ background: '#f8fafc' }}>
                    {editPanel(r)}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={12} className="muted">
                {rows.length === 0 ? 'No outward entries yet.' : 'No entries match the filter.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
