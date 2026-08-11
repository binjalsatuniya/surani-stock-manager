import { Fragment, useEffect, useState, type ChangeEvent } from 'react';
import { buildWhatsappLink, deliveryTermsLabel, type Item, type Outward, type Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';
import { useAuth } from '../context/AuthContext';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { useFinancialYear } from '../context/FinancialYearContext';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function payStatusLabel(m: Outward): string {
  if (m.payStatus === 'received') return 'Received';
  if (m.payStatus === 'credit') return `Credit (${m.creditDays} days)`;
  return 'Pending';
}

function dueDateFor(m: Outward): string {
  if (m.payStatus !== 'credit' || !m.creditDays) return 'N/A';
  const basis = m.invDate || m.deliveredAt || m.date;
  if (!basis) return 'N/A';
  return fmtDate(addDays(basis, m.creditDays));
}

export function OrderBookPage() {
  const can = usePermission();
  const { promptText } = useDialogs();
  const canRate = can('view_order_rate'); // whether this user may see the sale rate/amount
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const { fill } = useWhatsappTemplates();
  const { selectedFy } = useFinancialYear();
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [error, setError] = useState('');

  // Super Admin order editor
  const [editing, setEditing] = useState<Outward | null>(null);
  const [ed, setEd] = useState({ date: '', invNo: '', invDate: '', qty: '', rate: '', gstPct: '', payStatus: 'pending', creditDays: '', note: '' });

  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dInvNo, setDInvNo] = useState('');
  const [dInvDate, setDInvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dTransporter, setDTransporter] = useState('');
  const [dFreightRate, setDFreightRate] = useState('');
  const [dVehicle, setDVehicle] = useState('');
  const [dInvoiceFile, setDInvoiceFile] = useState(''); // new invoice PDF as a data URL (empty = keep existing)
  const [dInvoiceName, setDInvoiceName] = useState('');
  const [invoiceView, setInvoiceView] = useState<{ url: string; name: string } | null>(null);
  const [dHandlingAgent, setDHandlingAgent] = useState('');
  const [dHandlingRate, setDHandlingRate] = useState('');

  async function reload() {
    setRows(await api.orderbook.list({ fy: selectedFy || undefined }));
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

  function openDispatch(m: Outward) {
    setEditing(null); // only one inline panel open at a time
    setDispatchingId(m.id);
    setDInvNo(m.invNo || '');
    setDInvDate(m.invDate || new Date().toISOString().slice(0, 10));
    setDTransporter(m.transporterId || '');
    // Pre-fill freight from the order's own value, else the party's saved Default Freight (editable).
    const dfltFreight = parties.find((p) => p.id === m.partyId)?.defaultFreight || 0;
    setDFreightRate(String(m.freightRate || dfltFreight || ''));
    setDVehicle(m.vehicle || '');
    setDInvoiceFile('');
    setDInvoiceName(m.invoiceFileName || '');
    setDHandlingAgent(m.handlingAgentId || '');
    setDHandlingRate(String(m.handlingRate || ''));
  }

  async function confirmDispatch() {
    if (!dispatchingId || !dInvNo || !dInvDate) return;
    try {
      await api.orderbook.dispatch(dispatchingId, {
        invNo: dInvNo,
        invDate: dInvDate,
        transporterId: dTransporter || null,
        freightRate: Number(dFreightRate) || 0,
        vehicle: dVehicle.trim() || null,
        invoiceFile: dInvoiceFile || undefined, // undefined = keep the existing file
        invoiceFileName: dInvoiceFile ? dInvoiceName || undefined : undefined,
        handlingAgentId: dHandlingAgent || null,
        handlingRate: Number(dHandlingRate) || 0,
      });
      setDispatchingId(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dispatch order');
    }
  }

  function openEdit(m: Outward) {
    setDispatchingId(null); // only one inline panel open at a time
    setEditing(m);
    setEd({
      date: m.date,
      invNo: m.invNo || '',
      invDate: m.invDate || '',
      qty: String(m.qty),
      rate: String(m.rate),
      gstPct: String(m.gstPct),
      payStatus: m.payStatus,
      creditDays: String(m.creditDays),
      note: m.note || '',
    });
  }
  async function confirmEdit() {
    if (!editing) return;
    try {
      await api.outward.update(editing.id, {
        date: ed.date,
        invNo: ed.invNo.trim() || null,
        invDate: ed.invDate || null,
        qty: Number(ed.qty),
        rate: Number(ed.rate),
        gstPct: Number(ed.gstPct) || 0,
        payStatus: ed.payStatus as Outward['payStatus'],
        creditDays: Number(ed.creditDays) || 0,
        note: ed.note.trim() || null,
      });
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit order');
    }
  }

  async function onDeliver(id: string) {
    await api.orderbook.deliver(id);
    reload();
  }
  async function onCancel(id: string) {
    const note = await promptText('Cancel this order? Enter a reason (optional):', { okLabel: 'Cancel Order', cancelLabel: 'Keep Order' });
    if (note === null) return; // dismissed
    await api.orderbook.cancel(id, note.trim() || undefined);
    reload();
  }
  function onPickInvoice(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Invoice file is too large (max 5 MB).'); return; }
    const reader = new FileReader();
    reader.onload = () => { setDInvoiceFile(String(reader.result)); setDInvoiceName(file.name); };
    reader.readAsDataURL(file);
  }
  async function openInvoice(m: Outward) {
    try {
      const res = await api.orderbook.getInvoice(m.id);
      if (res.invoiceFile) setInvoiceView({ url: res.invoiceFile, name: res.invoiceFileName || 'Invoice' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the invoice'); }
  }
  async function shareInvoice(m: Outward) {
    try {
      const res = await api.orderbook.getInvoice(m.id);
      if (!res.invoiceFile) return;
      const a = document.createElement('a');
      a.href = res.invoiceFile;
      a.download = res.invoiceFileName || `${partyName(m.partyId)}-invoice`;
      document.body.appendChild(a); a.click(); a.remove();
      const party = partyById(m.partyId);
      window.open(buildWhatsappLink(party?.phone, `Invoice — ${partyName(m.partyId)}`), '_blank');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not share the invoice'); }
  }
  async function onRestore(id: string) {
    await api.orderbook.restore(id);
    reload();
  }

  const partyById = (id: string) => parties.find((p) => p.id === id);
  const itemById = (id: string) => items.find((i) => i.id === id);
  const transporterById = (id: string) => transporters.find((t) => t.id === id);
  const partyName = (id: string) => partyById(id)?.name || id;
  const itemName = (id: string) => itemById(id)?.name || id;
  const transporterName = (id: string | null) => (id ? transporterById(id)?.name || '—' : '—');

  // WhatsApp button — sends the "order on the way" message (editable in WhatsApp Messages → Order On The Way).
  function onShareDispatched(m: Outward) {
    const party = partyById(m.partyId);
    const item = itemById(m.itemId);
    const message = fill('orderDispatched', {
      partyName: party?.name || '',
      itemName: item?.name || '',
      qty: String(m.qty),
      unit: item?.unit || '',
      invNo: m.invNo || 'N/A',
      date: fmtDate(m.date),
      transporter: transporterName(m.transporterId),
      vehicle: m.vehicle || 'N/A',
    });
    // With a saved number this opens that chat; without one it opens WhatsApp's contact picker.
    window.open(buildWhatsappLink(party?.phone, message || ''), '_blank');
  }

  function onShareOrderSlip(m: Outward) {
    const party = partyById(m.partyId);
    const item = itemById(m.itemId);
    if (!party) return;
    const message = fill('orderSlip', {
      partyName: party.name,
      itemName: item?.name || '',
      qty: String(m.qty),
      unit: item?.unit || '',
      rate: m.rate.toFixed(2),
      amount: m.amount.toFixed(2),
      date: fmtDate(m.date),
      invNo: m.invNo || 'N/A',
      deliveryTerms: deliveryTermsLabel(m.deliveryType),
      payStatus: payStatusLabel(m),
      dueDate: dueDateFor(m),
    });
    if (message) window.open(buildWhatsappLink(party.phone, message), '_blank');
  }

  function onShareLocation(m: Outward) {
    const party = partyById(m.partyId);
    const transporter = m.transporterId ? transporterById(m.transporterId) : null;
    if (!party || !transporter) return;
    const message = fill('locationShare', {
      transporterName: transporter.name,
      partyName: party.name,
      partyPhone: party.phone || 'N/A',
      partyAddress: party.address || 'N/A',
      locationUrl: party.locationUrl || 'N/A',
      vehicle: m.vehicle || 'N/A',
    });
    if (message) window.open(buildWhatsappLink(transporter.phone, message), '_blank');
  }

  // Date-range filter (by order date) so you can view orders for a specific period.
  const dateRows = rows.filter((m) => {
    const d = (m.date || '').slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
  const pending = dateRows.filter((m) => m.fulfil === 'pending');
  const dispatched = dateRows.filter((m) => m.fulfil === 'dispatched');
  const delivered = dateRows.filter((m) => m.fulfil === 'delivered');
  const cancelled = dateRows.filter((m) => m.fulfil === 'cancelled');
  const pendingValue = pending.reduce((s, m) => s + Number(m.amount || 0), 0);

  const colCount = canRate ? 14 : 12;

  // The row, plus the Edit or Dispatch panel rendered directly beneath it when this is the
  // row being acted on — so the form opens where you clicked (same as Party Master).
  function orderRow(m: Outward) {
    return (
      <Fragment key={m.id}>
        {orderCells(m)}
        {editing?.id === m.id && (
          <tr>
            <td colSpan={colCount} style={{ background: '#f8fafc' }}>
              {editPanel(m)}
            </td>
          </tr>
        )}
        {dispatchingId === m.id && (
          <tr>
            <td colSpan={colCount} style={{ background: '#f8fafc' }}>
              {dispatchPanel()}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  function orderCells(m: Outward) {
    const party = partyById(m.partyId);
    return (
      <tr>
        <td>{fmtDate(m.date)}</td>
        <td>{m.invNo || '—'}</td>
        <td>{m.partyName || partyName(m.partyId)}</td>
        <td>{m.itemName || itemName(m.itemId)}</td>
        <td>{m.qty}</td>
        <td>{m.handling || 0}</td>
        {canRate && <td>₹{Number(m.amount).toFixed(2)}</td>}
        <td>{m.deliveryType || '—'}</td>
        <td>{m.deliveryDate ? fmtDate(m.deliveryDate) : '—'}</td>
        {canRate && <td>{payStatusLabel(m)}</td>}
        <td>{m.note || '—'}</td>
        <td>{m.transporterName || transporterName(m.transporterId)}</td>
        <td style={{ textTransform: 'capitalize' }}>
          {m.fulfil}
          {m.fulfil === 'cancelled' && m.cancelNote && (
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'none' }} title="Cancellation reason">
              🚫 {m.cancelNote}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {m.fulfil === 'pending' && can('dispatch_order') && (
              <button className="btn btn-sm btn-primary" onClick={() => openDispatch(m)}>
                Dispatch
              </button>
            )}
            {m.fulfil === 'dispatched' && can('dispatch_order') && (
              <button className="btn btn-sm btn-primary" onClick={() => onDeliver(m.id)}>
                Delivered
              </button>
            )}
            {m.fulfil === 'cancelled' && can('view_orderbook') && (
              <button className="btn btn-sm" onClick={() => onRestore(m.id)}>
                Restore
              </button>
            )}
            {m.fulfil !== 'cancelled' && m.fulfil !== 'delivered' && (
              <button className="btn btn-sm btn-danger" onClick={() => onCancel(m.id)}>
                Cancel
              </button>
            )}
            {m.fulfil === 'delivered' && isSuper && (
              <button className="btn btn-sm btn-danger" onClick={() => onCancel(m.id)} title="Super Admin can cancel a delivered order">
                Cancel
              </button>
            )}
            {isSuper && m.fulfil !== 'cancelled' && (
              <button className="btn btn-sm" onClick={() => (editing?.id === m.id ? setEditing(null) : openEdit(m))} title="Super Admin can edit this order">
                Edit
              </button>
            )}
            {can('send_whatsapp') && (
              <button
                className="btn btn-sm btn-whatsapp"
                onClick={() => onShareDispatched(m)}
                title="Send 'order on the way' message on WhatsApp"
              >
                WhatsApp
              </button>
            )}
            {can('send_whatsapp') && m.fulfil !== 'cancelled' && (
              <button className="btn btn-sm" onClick={() => onShareOrderSlip(m)} title="Send order slip on WhatsApp">
                Slip
              </button>
            )}
            {m.invoiceFileName && can('view_invoice') && (
              <button className="btn btn-sm" onClick={() => openInvoice(m)} title="View the attached invoice">
                📄 Invoice
              </button>
            )}
            {m.invoiceFileName && can('send_whatsapp') && (
              <button className="btn btn-sm btn-whatsapp" onClick={() => shareInvoice(m)} title="Download invoice & open WhatsApp to share">
                📤 Invoice
              </button>
            )}
            {can('send_whatsapp') &&
              (m.fulfil === 'dispatched' || m.fulfil === 'delivered') &&
              m.transporterId &&
              party?.locationUrl &&
              transporterById(m.transporterId)?.phone && (
                <button className="btn btn-sm" onClick={() => onShareLocation(m)} title="Send location to transporter">
                  Location
                </button>
              )}
          </div>
        </td>
      </tr>
    );
  }

  function dispatchPanel() {
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>Dispatch Order</div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice No.</label>
            <input value={dInvNo} onChange={(e) => setDInvNo(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice Date</label>
            <input type="date" value={dInvDate} onChange={(e) => setDInvDate(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Transporter</label>
            <select value={dTransporter} onChange={(e) => setDTransporter(e.target.value)}>
              <option value="">None</option>
              {transporters.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Freight Rate</label>
            <input value={dFreightRate} onChange={(e) => setDFreightRate(e.target.value)} style={{ width: 90 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Vehicle Number</label>
            <input value={dVehicle} onChange={(e) => setDVehicle(e.target.value)} placeholder="e.g. GJ-01-AB-1234" style={{ width: 150 }} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 220 }}>
            <label>Invoice PDF (scan)</label>
            <input type="file" accept="application/pdf,image/*" onChange={onPickInvoice} />
            {dInvoiceName && (
              <span className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                📄 {dInvoiceName}
                {dInvoiceFile ? '' : ' (already attached)'}
              </span>
            )}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Handling Agent</label>
            <select value={dHandlingAgent} onChange={(e) => setDHandlingAgent(e.target.value)}>
              <option value="">None</option>
              {handlers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Handling Rate</label>
            <input value={dHandlingRate} onChange={(e) => setDHandlingRate(e.target.value)} style={{ width: 90 }} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmDispatch}>
            Confirm Dispatch
          </button>
          <button className="btn btn-sm" onClick={() => setDispatchingId(null)}>
            Cancel
          </button>
        </div>
      </>
    );
  }

  function editPanel(m: Outward) {
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
          Edit Order — {partyName(m.partyId)} · {itemName(m.itemId)}
        </div>
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label>Date</label>
            <input type="date" value={ed.date} onChange={(e) => setEd({ ...ed, date: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice No.</label>
            <input value={ed.invNo} onChange={(e) => setEd({ ...ed, invNo: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice Date</label>
            <input type="date" value={ed.invDate} onChange={(e) => setEd({ ...ed, invDate: e.target.value })} />
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
            <select value={ed.payStatus} onChange={(e) => setEd({ ...ed, payStatus: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Credit Days</label>
            <input value={ed.creditDays} onChange={(e) => setEd({ ...ed, creditDays: e.target.value })} style={{ width: 90 }} />
          </div>
          <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Note</label>
            <input value={ed.note} onChange={(e) => setEd({ ...ed, note: e.target.value })} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmEdit}>Save Changes</button>
          <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </>
    );
  }

  const headerCells = (
    <tr>
      <th>Date</th>
      <th>Invoice</th>
      <th>Debtor</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Handling</th>
      {canRate && <th>Total</th>}
      <th>Delivery</th>
      <th>Delivery Date</th>
      {canRate && <th>Payment</th>}
      <th>Note</th>
      <th>Transporter</th>
      <th>Status</th>
      <th>Action</th>
    </tr>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Order Book <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— dispatch &amp; delivery tracking</span></h2>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="muted">Pending dispatch</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: pending.length ? '#ef4444' : undefined }}>{pending.length}</div>
        </div>
        <div className="card">
          <div className="muted">Dispatched</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{dispatched.length}</div>
        </div>
        <div className="card">
          <div className="muted">Delivered</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{delivered.length}</div>
        </div>
        {canRate && (
          <div className="card">
            <div className="muted">Pending value</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>₹{pendingValue.toFixed(2)}</div>
          </div>
        )}
      </div>

      {error && <div className="login-err show">{error}</div>}

      {/* Date-range filter — view orders for a specific period. */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>From date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>To date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate) && (
          <button className="btn btn-sm" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>Showing {dateRows.length} order(s)</span>
      </div>

      {/* New orders are placed from the Dashboard's "＋ New Order" card. */}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>📋 Orders Pending Dispatch</h3>
        <table>
          <thead>{headerCells}</thead>
          <tbody>
            {pending.map(orderRow)}
            {pending.length === 0 && (
              <tr>
                <td colSpan={12} className="muted">No orders pending dispatch.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>🚚 Dispatched Orders</h3>
        <table>
          <thead>{headerCells}</thead>
          <tbody>
            {dispatched.map(orderRow)}
            {dispatched.length === 0 && (
              <tr>
                <td colSpan={12} className="muted">No dispatched orders.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {delivered.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>✅ Delivered</h3>
          <table>
            <thead>{headerCells}</thead>
            <tbody>{delivered.map(orderRow)}</tbody>
          </table>
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🚫 Cancelled</h3>
          <table>
            <thead>{headerCells}</thead>
            <tbody>{cancelled.map(orderRow)}</tbody>
          </table>
        </div>
      )}

      {invoiceView && (
        <div
          onClick={() => setInvoiceView(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: 900, height: '85%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ flex: 1 }}>📄 {invoiceView.name}</strong>
              <button className="btn btn-sm" onClick={() => setInvoiceView(null)}>Close</button>
            </div>
            {invoiceView.url.startsWith('data:image') || /\.(png|jpe?g|gif|webp)$/i.test(invoiceView.name) ? (
              <img src={invoiceView.url} alt={invoiceView.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', margin: 'auto' }} />
            ) : (
              <iframe src={invoiceView.url} title={invoiceView.name} style={{ flex: 1, border: 'none', width: '100%' }} />
            )}
          </div>
        </div>
      )}

    </div>
  );
}
