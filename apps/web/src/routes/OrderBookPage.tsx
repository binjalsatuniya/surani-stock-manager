import { fmtAmount } from '@surani/shared';
import { Fragment, useEffect, useState, type ChangeEvent } from 'react';
import { deliveryTermsLabel, type Item, type Outward, type Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { shareOnWhatsapp } from '../lib/whatsappShare';
import { usePermission } from '../hooks/usePermission';
import { useEscToClose } from '../hooks/useEscToClose';
import { useDialogs } from '../components/Dialogs';
import { useAuth } from '../context/AuthContext';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { useFinancialYear } from '../context/FinancialYearContext';
import { readInvoiceQr } from '../lib/invoiceQr';
import { readVehicleNumber } from '../lib/vehicleOcr';
import { dataUrlToBlob, looksLikePdf } from '../lib/dataUrl';

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

// The credit period as days (e.g. "10 days") for the WhatsApp slip — shown instead of the due date.
function dueDaysFor(m: Outward): string {
  if (m.payStatus !== 'credit' || !m.creditDays) return 'N/A';
  return `${m.creditDays} days`;
}

export function OrderBookPage() {
  const can = usePermission();
  const { promptText } = useDialogs();
  const canRate = can('view_order_rate'); // whether this user may see the sale rate/amount
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Free-text search over company name, invoice number and item — applies to every section below.
  const [search, setSearch] = useState('');
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
  // Result of reading the e-Invoice QR off the attached scan.
  const [qrStatus, setQrStatus] = useState<'idle' | 'reading' | 'ok' | 'none'>('idle');
  // The vehicle number is read by OCR, so it is a suggestion — never presented as certain.
  const [vehicleStatus, setVehicleStatus] = useState<'idle' | 'reading' | 'guessed' | 'none'>('idle');
  const [qrWarnings, setQrWarnings] = useState<string[]>([]);
  // `url` is a blob: URL created on open and revoked on close — see openInvoice/closeInvoice.
  const [invoiceView, setInvoiceView] = useState<{ url: string; name: string; isPdf: boolean } | null>(null);
  useEscToClose(!!invoiceView, () => closeInvoice());
  useEscToClose(!!dispatchingId, () => setDispatchingId(null));
  useEscToClose(!!editing, () => setEditing(null));
  const [dHandlingAgent, setDHandlingAgent] = useState('');
  const [dHandlingRate, setDHandlingRate] = useState('');

  // Split a pending order into several deliveries. `splitParts` holds each part's quantity (as text
  // inputs); they must add up to the order's quantity.
  const [splitting, setSplitting] = useState<Outward | null>(null);
  const [splitParts, setSplitParts] = useState<string[]>([]);
  const [splitError, setSplitError] = useState('');
  useEscToClose(!!splitting, () => setSplitting(null));

  function openSplit(m: Outward) {
    setSplitError('');
    setSplitting(m);
    // Default to two even halves; the user can change the count and each amount.
    const half = Math.round((Number(m.qty) / 2) * 1000) / 1000;
    setSplitParts([String(half), String(Math.round((Number(m.qty) - half) * 1000) / 1000)]);
  }

  function setSplitCount(n: number) {
    if (!splitting) return;
    const total = Number(splitting.qty);
    const each = Math.floor((total / n) * 1000) / 1000;
    const parts = Array.from({ length: n }, () => String(each));
    // Put the rounding remainder on the last part so the sum stays exact.
    parts[n - 1] = String(Math.round((total - each * (n - 1)) * 1000) / 1000);
    setSplitParts(parts);
    setSplitError('');
  }

  function setSplitPart(i: number, value: string) {
    setSplitParts((ps) => ps.map((p, j) => (j === i ? value : p)));
    setSplitError('');
  }

  async function confirmSplit() {
    if (!splitting) return;
    const nums = splitParts.map((p) => Number(p));
    if (nums.some((n) => !(n > 0))) return setSplitError('Every part must be a quantity greater than zero.');
    const sum = Math.round(nums.reduce((s, n) => s + n, 0) * 1000) / 1000;
    const total = Math.round(Number(splitting.qty) * 1000) / 1000;
    if (sum !== total) return setSplitError(`The parts add up to ${sum}, but the order is ${total}. They must match.`);
    try {
      await api.orderbook.split(splitting.id, nums);
      setSplitting(null);
      reload();
    } catch (e) {
      setSplitError(e instanceof Error ? e.message : 'Failed to split the order');
    }
  }

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
    setQrStatus('idle');
    setQrWarnings([]);
    setVehicleStatus('idle');
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
    if (!dispatchingId) return;
    // Previously this returned silently, so the button looked broken when a field was blank.
    if (!dInvNo.trim()) return setError('Enter the invoice number.');
    if (!dInvDate) return setError('Enter the invoice date.');
    setError('');
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
    readQrFrom(file);
    readVehicleFrom(file);
  }

  /**
   * Read the e-Invoice QR off the attached scan and fill in the invoice number and date.
   * The QR is signed government data, so it is exact — but it is still cross-checked against the
   * order, because the commonest mistake is attaching the right-looking file for the wrong order.
   */
  /**
   * Read the vehicle number off the e-Way Bill page. This is OCR, not the QR — the government's
   * e-Way Bill QR does not carry it — so the result is offered for checking, never trusted.
   */
  async function readVehicleFrom(file: File) {
    if (dVehicle.trim()) return; // never overwrite something already entered
    setVehicleStatus('reading');
    const found = await readVehicleNumber(file);
    if (!found) {
      setVehicleStatus('none');
      return;
    }
    // Only fill if it is still empty — the read takes seconds and the user may have typed by now.
    setDVehicle((cur) => (cur.trim() ? cur : found));
    setVehicleStatus('guessed');
  }

  async function readQrFrom(file: File) {
    const order = rows.find((r) => r.id === dispatchingId);
    setQrStatus('reading');
    setQrWarnings([]);
    const qr = await readInvoiceQr(file);
    if (!qr) {
      setQrStatus('none');
      return;
    }

    setDInvNo(qr.docNo);
    if (qr.docDate) setDInvDate(qr.docDate);
    setQrStatus('ok');

    const warn: string[] = [];
    if (order) {
      if (qr.totalValue != null) {
        const amount = Number(order.amount || 0);
        // Round both sides — the QR carries whole rupees on a value we hold to two decimals.
        if (Math.abs(Math.round(qr.totalValue) - Math.round(amount)) > 1) {
          warn.push(
            `Invoice total ₹${qr.totalValue.toLocaleString('en-IN')} does not match this order's ₹${amount.toLocaleString('en-IN')}.`
          );
        }
      }
      const partyGst = (partyById(order.partyId)?.gst || '').replace(/\s/g, '').toUpperCase();
      const buyerGst = (qr.buyerGstin || '').replace(/\s/g, '').toUpperCase();
      if (partyGst && buyerGst && partyGst !== buyerGst) {
        warn.push(`Invoice is billed to GSTIN ${buyerGst}, but this order's party is ${partyGst}.`);
      }
    }
    setQrWarnings(warn);
  }
  async function openInvoice(m: Outward) {
    try {
      const res = await api.orderbook.getInvoice(m.id);
      // Previously this returned in silence when the file was missing, so the button looked dead.
      if (!res.invoiceFile) {
        setError('No invoice file is attached to this order. Use “Edit Dispatch” to attach one.');
        return;
      }
      const name = res.invoiceFileName || 'Invoice';
      const blob = dataUrlToBlob(res.invoiceFile);
      if (!blob) {
        setError('The attached invoice could not be read — it may have been saved incompletely.');
        return;
      }
      const isPdf = looksLikePdf(blob, name);
      closeInvoice(); // release any previously opened blob before replacing it
      setInvoiceView({ url: URL.createObjectURL(blob), name, isPdf });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open the invoice'); }
  }

  /** Revoking the object URL frees the file from memory; a big scan is several MB. */
  function closeInvoice() {
    setInvoiceView((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function shareInvoice(m: Outward) {
    try {
      const res = await api.orderbook.getInvoice(m.id);
      if (!res.invoiceFile) {
        setError('No invoice file is attached to this order.');
        return;
      }
      const blob = dataUrlToBlob(res.invoiceFile);
      if (!blob) {
        setError('The attached invoice could not be read.');
        return;
      }
      // Download via a blob URL — a multi-MB data: URL can exceed the browser's href limit.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.invoiceFileName || `${partyName(m.partyId)}-invoice`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000); // let the download start first
      const party = partyById(m.partyId);
      // Same path as every other share: copy the caption and just open the chat (empty), so the user
      // attaches the invoice that was just downloaded — and it opens the WhatsApp app on desktop.
      shareOnWhatsapp(party?.phone, `Invoice — ${partyName(m.partyId)}`);
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
    shareOnWhatsapp(party?.phone, message || '');
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
      rate: fmtAmount(m.rate),
      amount: fmtAmount(m.amount),
      date: fmtDate(m.date),
      invNo: m.invNo || 'N/A',
      deliveryTerms: deliveryTermsLabel(m.deliveryType),
      deliveryDate: m.deliveryDate ? fmtDate(m.deliveryDate) : 'N/A',
      payStatus: payStatusLabel(m),
      dueDays: dueDaysFor(m),
      dueDate: dueDateFor(m),
    });
    if (message) shareOnWhatsapp(party.phone, message);
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
    if (message) shareOnWhatsapp(transporter.phone, message);
  }

  // Date-range + search filter (by order date, and company / invoice / item) so you can view or find
  // specific orders. Both apply to every section below (pending, dispatched, delivered, cancelled).
  const q = search.trim().toLowerCase();
  const dateRows = rows.filter((m) => {
    const d = (m.date || '').slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    if (q) {
      const hay = [
        m.partyName || partyName(m.partyId),
        m.invNo || '',
        m.itemName || itemName(m.itemId),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
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
              {dispatchPanel(m)}
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
        <td>{fmtAmount(m.handling || 0)}</td>
        {/* Freight only applies to FOR orders; Ex-Works leaves transport to the buyer, so show a dash. */}
        <td>{m.deliveryType === 'FOR' ? fmtAmount(m.freightRate || 0) : '—'}</td>
        {canRate && <td>₹{fmtAmount(m.amount)}</td>}
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
          {/* A fixed 3-column grid keeps the action buttons in tidy, aligned columns and uses the
              width available, instead of a flex-wrap that crammed two per row with a gap beside them. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 5, minWidth: 236 }}>
            {/* Re-opening the panel on a dispatched order is how its invoice, transporter,
                vehicle and freight/handling get corrected — the API deletes and re-posts the
                freight/handling entries, which a plain field edit would not do. */}
            {(m.fulfil === 'pending' || m.fulfil === 'dispatched') && can('dispatch_order') && (
              <button
                className={m.fulfil === 'pending' ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
                onClick={() => (dispatchingId === m.id ? setDispatchingId(null) : openDispatch(m))}
                title={
                  m.fulfil === 'pending'
                    ? 'Enter invoice & transport details, then dispatch'
                    : 'Correct the invoice, transporter, vehicle or freight/handling on this dispatch'
                }
              >
                {m.fulfil === 'pending' ? 'Dispatch' : 'Edit Dispatch'}
              </button>
            )}
            {m.fulfil === 'pending' && can('split_order') && (
              <button
                className="btn btn-sm"
                onClick={() => openSplit(m)}
                title="Split this order into separate deliveries (e.g. 2000 → 1000 + 1000), each with its own invoice"
              >
                Split
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

  function dispatchPanel(m: Outward) {
    const redispatch = m.fulfil === 'dispatched';
    return (
      <>
        <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>
          {redispatch ? 'Edit Dispatch' : 'Dispatch Order'} — {partyName(m.partyId)} · {itemName(m.itemId)}
        </div>
        {redispatch && (
          <div className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
            Saving re-posts this order's freight and handling entries with the values below.
          </div>
        )}
        <div className="toolbar">
          <div className="field" style={{ margin: 0 }}>
            <label>Invoice No.</label>
            <input
              value={dInvNo}
              onChange={(e) => setDInvNo(e.target.value)}
              style={qrStatus === 'ok' ? { background: '#f0fdf4', borderColor: '#bbf7d0' } : undefined}
            />
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
            <input
              value={dVehicle}
              onChange={(e) => {
                setDVehicle(e.target.value);
                setVehicleStatus('idle'); // typed over — no longer a guess
              }}
              placeholder="e.g. GJ-01-AB-1234"
              style={{
                width: 150,
                ...(vehicleStatus === 'guessed' ? { background: '#fffbeb', borderColor: '#fcd34d' } : {}),
              }}
            />
            {vehicleStatus === 'reading' && (
              <span className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>Reading from e-Way Bill…</span>
            )}
            {vehicleStatus === 'guessed' && (
              <span style={{ fontSize: 10.5, marginTop: 3, color: '#b45309' }}>
                Read from the e-Way Bill — please check
              </span>
            )}
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
            {qrStatus === 'reading' && (
              <span className="muted" style={{ fontSize: 11, marginTop: 3 }}>Reading invoice QR…</span>
            )}
            {qrStatus === 'ok' && (
              <span style={{ fontSize: 11, marginTop: 3, color: '#15803d' }}>
                ✓ Invoice no. &amp; date read from the QR code
              </span>
            )}
            {qrStatus === 'none' && (
              <span className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                No QR code found — please enter the invoice details manually.
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
        {qrWarnings.length > 0 && (
          <div
            style={{
              marginTop: 8,
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              color: '#92400e',
            }}
          >
            <strong>⚠ Check this invoice is the right one</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {qrWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div style={{ marginTop: 4 }}>You can still dispatch — this is only a warning.</div>
          </div>
        )}
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
        <div className="toolbar" style={{ marginTop: 6 }}>
          <button className="btn btn-primary" onClick={confirmDispatch}>
            {redispatch ? 'Save Dispatch Details' : 'Confirm Dispatch'}
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
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
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
      <th>Freight</th>
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
            <div style={{ fontSize: 26, fontWeight: 700 }}>₹{fmtAmount(pendingValue)}</div>
          </div>
        )}
      </div>

      {/* While an inline panel is open its own copy of the error is shown beside its buttons. */}
      {error && !dispatchingId && !editing && <div className="login-err show">{error}</div>}

      {/* Search + date-range filter — find an order by company, or view a specific period. */}
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label>Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Company name, invoice no. or item…"
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>From date</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>To date</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {(fromDate || toDate || search) && (
          <button className="btn btn-sm" onClick={() => { setFromDate(''); setToDate(''); setSearch(''); }}>Clear</button>
        )}
        <span className="muted" style={{ fontSize: 12 }}>Showing {dateRows.length} order(s)</span>
      </div>

      {/* New orders are placed from the Dashboard's "＋ New Order" card. */}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>📋 Orders Pending Dispatch</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>{headerCells}</thead>
            <tbody>
              {pending.map(orderRow)}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={13} className="muted">No orders pending dispatch.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>🚚 Dispatched Orders</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>{headerCells}</thead>
            <tbody>
              {dispatched.map(orderRow)}
              {dispatched.length === 0 && (
                <tr>
                  <td colSpan={13} className="muted">No dispatched orders.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {delivered.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>✅ Delivered <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>({delivered.length})</span></h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>{headerCells}</thead>
              <tbody>{delivered.map(orderRow)}</tbody>
            </table>
          </div>
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🚫 Cancelled</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>{headerCells}</thead>
              <tbody>{cancelled.map(orderRow)}</tbody>
            </table>
          </div>
        </div>
      )}

      {invoiceView && (
        <div
          onClick={closeInvoice}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: 900, height: '85%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <strong style={{ flex: 1 }}>📄 {invoiceView.name}</strong>
              {/* Escape hatch: if the embedded viewer still refuses, the file opens in a real tab. */}
              <button className="btn btn-sm" onClick={() => window.open(invoiceView.url, '_blank')}>
                Open in new tab
              </button>
              <a className="btn btn-sm" href={invoiceView.url} download={invoiceView.name} style={{ textDecoration: 'none' }}>
                Download
              </a>
              <button className="btn btn-sm" onClick={closeInvoice}>Close</button>
            </div>
            {invoiceView.isPdf ? (
              <iframe src={invoiceView.url} title={invoiceView.name} style={{ flex: 1, border: 'none', width: '100%' }} />
            ) : (
              <img src={invoiceView.url} alt={invoiceView.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', margin: 'auto' }} />
            )}
          </div>
        </div>
      )}

      {splitting && (
        <div
          onClick={() => setSplitting(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '92%', maxWidth: 460 }}>
            <h3 style={{ marginTop: 0 }}>Split order into deliveries</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {itemName(splitting.itemId)} — total <strong>{Number(splitting.qty)}</strong>. Each part becomes its own
              order you dispatch separately (own invoice, vehicle & transporter). The parts must add up to the total.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <label style={{ fontSize: 13 }}>Number of deliveries</label>
              <select
                value={splitParts.length}
                onChange={(e) => setSplitCount(Number(e.target.value))}
                style={{ padding: '4px 8px' }}
              >
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {splitParts.map((p, i) => (
              <div key={i} className="field" style={{ margin: '0 0 8px' }}>
                <label>Delivery {i + 1} quantity</label>
                <input type="number" min="0" step="0.001" value={p} onChange={(e) => setSplitPart(i, e.target.value)} />
              </div>
            ))}

            {(() => {
              const sum = Math.round(splitParts.reduce((s, p) => s + (Number(p) || 0), 0) * 1000) / 1000;
              const total = Math.round(Number(splitting.qty) * 1000) / 1000;
              const ok = sum === total;
              return (
                <div style={{ fontSize: 12.5, marginBottom: 8, color: ok ? '#15803d' : '#b45309', fontWeight: 600 }}>
                  Parts total: {sum} / {total} {ok ? '✓' : '— must match'}
                </div>
              );
            })()}

            {splitError && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 8 }}>{splitError}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setSplitting(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={confirmSplit}>Split order</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
