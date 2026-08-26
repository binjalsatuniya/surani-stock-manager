import { fmtMoney, fmtAmount } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { buildWhatsappLink, deliveryTermsLabel, type Item, type Outward, type Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../context/AuthContext';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const inr = (n: number) => fmtMoney(n);

function payStatusLabel(m: Outward): string {
  if (m.payStatus === 'received') return 'Received';
  if (m.payStatus === 'credit') return `Credit (${m.creditDays} days)`;
  return 'Pending';
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dueDateFor(m: Outward): string {
  if (m.payStatus !== 'credit' || !m.creditDays) return 'N/A';
  const basis = m.invDate || m.deliveredAt || m.date;
  if (!basis) return 'N/A';
  return fmtDate(addDays(basis, m.creditDays));
}

// Credit period as days (e.g. "10 days") for the WhatsApp slip — shown instead of the due date.
function dueDaysFor(m: Outward): string {
  if (m.payStatus !== 'credit' || !m.creditDays) return 'N/A';
  return `${m.creditDays} days`;
}

export function OrderBookScreen() {
  const can = usePermission();
  const canRate = can('view_order_rate'); // whether this user may see the sale rate/amount
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelText, setCancelText] = useState('');
  const { user } = useAuth();
  const isSuper = user?.role === 'superadmin';
  const { fill } = useWhatsappTemplates();
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Super Admin order editor
  const [editing, setEditing] = useState<Outward | null>(null);
  const [ed, setEd] = useState({ date: '', invNo: '', invDate: '', qty: '', rate: '', gstPct: '', payStatus: 'pending', creditDays: '', note: '' });

  // Dispatch form
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dInvNo, setDInvNo] = useState('');
  const [dInvDate, setDInvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dTransporter, setDTransporter] = useState('');
  const [dFreightRate, setDFreightRate] = useState('');
  const [dVehicle, setDVehicle] = useState('');
  const [dHandlingAgent, setDHandlingAgent] = useState('');
  const [dHandlingRate, setDHandlingRate] = useState('');

  // Split a pending order into several deliveries; each part's quantity is a text input and they
  // must add up to the order's quantity.
  const [splitting, setSplitting] = useState<Outward | null>(null);
  const [splitParts, setSplitParts] = useState<string[]>([]);

  function openSplit(m: Outward) {
    setError('');
    setSplitting(m);
    const half = Math.round((Number(m.qty) / 2) * 1000) / 1000;
    setSplitParts([String(half), String(Math.round((Number(m.qty) - half) * 1000) / 1000)]);
  }
  function setSplitCount(n: number) {
    if (!splitting) return;
    const total = Number(splitting.qty);
    const each = Math.floor((total / n) * 1000) / 1000;
    const parts = Array.from({ length: n }, () => String(each));
    parts[n - 1] = String(Math.round((total - each * (n - 1)) * 1000) / 1000);
    setSplitParts(parts);
  }
  function setSplitPart(i: number, value: string) {
    setSplitParts((ps) => ps.map((p, j) => (j === i ? value : p)));
  }
  function confirmSplit() {
    if (!splitting) return;
    const nums = splitParts.map((p) => Number(p));
    if (nums.some((n) => !(n > 0))) { setError('Every part must be a quantity greater than zero.'); return; }
    const sum = Math.round(nums.reduce((s, n) => s + n, 0) * 1000) / 1000;
    const total = Math.round(Number(splitting.qty) * 1000) / 1000;
    if (sum !== total) { setError(`The parts add up to ${sum}, but the order is ${total}. They must match.`); return; }
    const id = splitting.id;
    setSplitting(null);
    act(() => api.orderbook.split(id, nums), 'Failed to split the order');
  }

  async function reload() {
    setRows(await api.orderbook.list());
  }

  useEffect(() => {
    reload().catch(() => {});
    api.parties.list('debtor').then(setParties).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.parties.list('transporter').then(setTransporters).catch(() => {});
    api.parties.list('handling').then(setHandlers).catch(() => {});
  }, []);

  const partyById = (id: string) => parties.find((p) => p.id === id);
  const partyName = (id: string) => partyById(id)?.name || id;
  const itemById = (id: string) => items.find((i) => i.id === id);
  const itemName = (id: string) => itemById(id)?.name || id;
  const transporterById = (id: string) => transporters.find((t) => t.id === id);
  const transporterName = (id: string | null) => (id ? transporterById(id)?.name || '—' : '—');

  function openDispatch(m: Outward) {
    setError('');
    setDispatchingId(m.id);
    setDInvNo(m.invNo || '');
    setDInvDate(m.invDate || new Date().toISOString().slice(0, 10));
    setDTransporter(m.transporterId || '');
    // Pre-fill freight from the order's own value, else the party's saved Default Freight (editable).
    const dfltFreight = partyById(m.partyId)?.defaultFreight || 0;
    setDFreightRate(String(m.freightRate || dfltFreight || ''));
    setDVehicle(m.vehicle || '');
    setDHandlingAgent(m.handlingAgentId || '');
    setDHandlingRate(String(m.handlingRate || ''));
  }

  async function confirmDispatch() {
    if (!dispatchingId) return;
    if (!dInvNo.trim() || !dInvDate) {
      setError('Invoice number and invoice date are required to dispatch.');
      return;
    }
    setBusy(true);
    try {
      await api.orderbook.dispatch(dispatchingId, {
        invNo: dInvNo.trim(),
        invDate: dInvDate,
        transporterId: dTransporter || null,
        freightRate: Number(dFreightRate) || 0,
        vehicle: dVehicle.trim() || null,
        handlingAgentId: dHandlingAgent || null,
        handlingRate: Number(dHandlingRate) || 0,
      });
      setDispatchingId(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dispatch order');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, failMsg: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : failMsg);
    } finally {
      setBusy(false);
    }
  }

  function openCancel(m: Outward) {
    setCancelText('');
    setCancellingId(m.id);
  }
  function confirmCancel() {
    if (!cancellingId) return;
    const id = cancellingId;
    const note = cancelText.trim() || undefined;
    setCancellingId(null);
    act(() => api.orderbook.cancel(id, note), 'Failed to cancel');
  }

  function openWa(phone: string | null | undefined, message: string) {
    Linking.openURL(buildWhatsappLink(phone, message)).catch(() => setError('Could not open WhatsApp on this phone.'));
  }

  // "Order on the way" — uses the editable orderDispatched template (WhatsApp Messages screen).
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
    openWa(party?.phone, message || '');
  }

  // Order slip — the full order/bill summary (orderSlip template).
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
    if (message) openWa(party.phone, message);
  }

  // Send delivery location details to the transporter (locationShare template).
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
    if (message) openWa(transporter.phone, message);
  }

  function openEdit(m: Outward) {
    setError('');
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
    setBusy(true);
    setError('');
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit order');
    } finally {
      setBusy(false);
    }
  }

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

  function OrderCard({ m }: { m: Outward }) {
    const party = partyById(m.partyId);
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{m.partyName || partyName(m.partyId)}</Text>
          {canRate && <Text style={styles.amount}>{inr(m.amount)}</Text>}
        </View>
        <Text style={styles.cardSub}>
          {(m.itemName || itemName(m.itemId))} · {m.qty} · {fmtDate(m.date)}
        </Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice</Text>
          <Text style={styles.detailVal}>{m.invNo || '—'}</Text>
        </View>
        {m.deliveryDate ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Delivery Date</Text>
            <Text style={styles.detailVal}>{fmtDate(m.deliveryDate)}</Text>
          </View>
        ) : null}
        {canRate ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Payment</Text>
            <Text style={styles.detailVal}>{payStatusLabel(m)}</Text>
          </View>
        ) : null}
        {m.note ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Note</Text>
            <Text style={styles.detailVal}>{m.note}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Transporter</Text>
          <Text style={styles.detailVal}>{m.transporterName || transporterName(m.transporterId)}</Text>
        </View>
        {/* Freight only applies to FOR orders; Ex-Works leaves transport to the buyer. */}
        {m.deliveryType === 'FOR' ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Freight</Text>
            <Text style={styles.detailVal}>{inr(m.freightRate || 0)}</Text>
          </View>
        ) : null}
        {m.fulfil === 'cancelled' && m.cancelNote ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>🚫 Reason</Text>
            <Text style={[styles.detailVal, { color: '#b91c1c' }]}>{m.cancelNote}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {m.fulfil === 'pending' && can('dispatch_order') && (
            <TouchableOpacity style={styles.btnSmPrimary} onPress={() => openDispatch(m)}>
              <Text style={styles.btnSmPrimaryText}>Dispatch</Text>
            </TouchableOpacity>
          )}
          {m.fulfil === 'pending' && can('split_order') && (
            <TouchableOpacity style={styles.btnSm} onPress={() => openSplit(m)}>
              <Text style={styles.btnSmText}>Split</Text>
            </TouchableOpacity>
          )}
          {m.fulfil === 'dispatched' && can('dispatch_order') && (
            <TouchableOpacity style={styles.btnSmPrimary} onPress={() => act(() => api.orderbook.deliver(m.id), 'Failed to mark delivered')}>
              <Text style={styles.btnSmPrimaryText}>Delivered</Text>
            </TouchableOpacity>
          )}
          {m.fulfil === 'cancelled' && can('view_orderbook') && (
            <TouchableOpacity style={styles.btnSm} onPress={() => act(() => api.orderbook.restore(m.id), 'Failed to restore')}>
              <Text style={styles.btnSmText}>Restore</Text>
            </TouchableOpacity>
          )}
          {isSuper && m.fulfil !== 'cancelled' && (
            <TouchableOpacity style={styles.btnSm} onPress={() => openEdit(m)}>
              <Text style={styles.btnSmText}>Edit</Text>
            </TouchableOpacity>
          )}
          {can('send_whatsapp') && (
            <TouchableOpacity style={styles.btnSmWa} onPress={() => onShareDispatched(m)}>
              <Text style={styles.btnSmWaText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          {can('send_whatsapp') && m.fulfil !== 'cancelled' && (
            <TouchableOpacity style={styles.btnSm} onPress={() => onShareOrderSlip(m)}>
              <Text style={styles.btnSmText}>Slip</Text>
            </TouchableOpacity>
          )}
          {can('send_whatsapp') &&
            (m.fulfil === 'dispatched' || m.fulfil === 'delivered') &&
            m.transporterId &&
            party?.locationUrl &&
            transporterById(m.transporterId)?.phone && (
              <TouchableOpacity style={styles.btnSm} onPress={() => onShareLocation(m)}>
                <Text style={styles.btnSmText}>Location</Text>
              </TouchableOpacity>
            )}
          {m.fulfil !== 'cancelled' && m.fulfil !== 'delivered' && (
            <TouchableOpacity style={styles.btnSmDanger} onPress={() => openCancel(m)}>
              <Text style={styles.btnSmDangerText}>Cancel</Text>
            </TouchableOpacity>
          )}
          {m.fulfil === 'delivered' && isSuper && (
            <TouchableOpacity style={styles.btnSmDanger} onPress={() => openCancel(m)}>
              <Text style={styles.btnSmDangerText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  function Section({ title, list, empty }: { title: string; list: Outward[]; empty: string }) {
    return (
      <View style={{ marginTop: 18 }}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {list.length > 0 ? (
            <View style={styles.countChip}>
              <Text style={styles.countChipText}>{list.length}</Text>
            </View>
          ) : null}
        </View>
        {list.map((m) => (
          <OrderCard key={m.id} m={m} />
        ))}
        {list.length === 0 ? <Text style={styles.empty}>{empty}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {/* KPIs */}
      <View style={styles.kpiRow}>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Pending dispatch</Text>
          <Text style={[styles.kpiValue, pending.length ? { color: '#ef4444' } : null]}>{pending.length}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Dispatched</Text>
          <Text style={styles.kpiValue}>{dispatched.length}</Text>
        </View>
        <View style={styles.kpi}>
          <Text style={styles.kpiLabel}>Delivered</Text>
          <Text style={styles.kpiValue}>{delivered.length}</Text>
        </View>
        {canRate && (
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Pending value</Text>
            <Text style={styles.kpiValue}>{inr(pendingValue)}</Text>
          </View>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Date-range filter */}
      <View style={[styles.card, styles.formCard]}>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>From date</Text>
            <TextInput style={styles.input} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>To date</Text>
            <TextInput style={styles.input} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" />
          </View>
        </View>
        {fromDate || toDate ? (
          <TouchableOpacity style={styles.btnGhost} onPress={() => { setFromDate(''); setToDate(''); }}>
            <Text style={styles.btnGhostText}>Clear dates</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Cancel-with-reason modal */}
      {cancellingId ? (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>Cancel Order</Text>
          <Text style={styles.label}>Reason (optional)</Text>
          <TextInput
            style={styles.input}
            value={cancelText}
            onChangeText={setCancelText}
            placeholder="e.g. customer cancelled, wrong item…"
          />
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btnSmDanger, styles.col]} onPress={confirmCancel}>
              <Text style={styles.btnSmDangerText}>Confirm Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setCancellingId(null)}>
              <Text style={styles.btnGhostText}>Keep Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Split-into-deliveries form */}
      {splitting ? (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>Split Order</Text>
          <Text style={styles.label}>
            {itemName(splitting.itemId)} — total {Number(splitting.qty)}. Each part becomes its own order to dispatch
            separately. The parts must add up to the total.
          </Text>

          <Text style={styles.label}>Number of deliveries</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={splitParts.length} onValueChange={(v) => setSplitCount(Number(v))} style={styles.picker}>
              {[2, 3, 4, 5].map((n) => (
                <Picker.Item key={n} label={String(n)} value={n} />
              ))}
            </Picker>
          </View>

          {splitParts.map((p, i) => (
            <View key={i}>
              <Text style={styles.label}>Delivery {i + 1} quantity</Text>
              <TextInput style={styles.input} value={p} onChangeText={(v) => setSplitPart(i, v)} keyboardType="numeric" />
            </View>
          ))}

          {(() => {
            const sum = Math.round(splitParts.reduce((s, p) => s + (Number(p) || 0), 0) * 1000) / 1000;
            const total = Math.round(Number(splitting.qty) * 1000) / 1000;
            return (
              <Text style={[styles.label, { color: sum === total ? '#15803d' : '#b45309', fontWeight: '700' }]}>
                Parts total: {sum} / {total} {sum === total ? '✓' : '— must match'}
              </Text>
            );
          })()}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btnSmPrimary, styles.col]} onPress={confirmSplit}>
              <Text style={styles.btnSmPrimaryText}>Split Order</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setSplitting(null)}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Dispatch form */}
      {dispatchingId ? (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>Dispatch Order</Text>

          <Text style={styles.label}>Invoice No. *</Text>
          <TextInput style={styles.input} value={dInvNo} onChangeText={setDInvNo} />

          <Text style={styles.label}>Invoice Date *</Text>
          <TextInput style={styles.input} value={dInvDate} onChangeText={setDInvDate} placeholder="YYYY-MM-DD" />

          <Text style={styles.label}>Transporter</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={dTransporter} onValueChange={setDTransporter} style={styles.picker}>
              <Picker.Item label="None" value="" />
              {transporters.map((t) => (
                <Picker.Item key={t.id} label={t.name} value={t.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Freight Rate</Text>
          <TextInput style={styles.input} value={dFreightRate} onChangeText={setDFreightRate} keyboardType="numeric" />

          <Text style={styles.label}>Vehicle Number</Text>
          <TextInput style={styles.input} value={dVehicle} onChangeText={setDVehicle} placeholder="e.g. GJ-01-AB-1234" autoCapitalize="characters" />

          <Text style={styles.label}>Handling Agent</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={dHandlingAgent} onValueChange={setDHandlingAgent} style={styles.picker}>
              <Picker.Item label="None" value="" />
              {handlers.map((h) => (
                <Picker.Item key={h.id} label={h.name} value={h.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Handling Rate</Text>
          <TextInput style={styles.input} value={dHandlingRate} onChangeText={setDHandlingRate} keyboardType="numeric" />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, busy && styles.btnDisabled]} onPress={confirmDispatch} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Dispatching…' : 'Confirm Dispatch'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setDispatchingId(null)}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Super Admin order editor */}
      {editing ? (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>
            Edit Order — {partyName(editing.partyId)} · {itemName(editing.itemId)}
          </Text>

          <Text style={styles.label}>Date</Text>
          <TextInput style={styles.input} value={ed.date} onChangeText={(v) => setEd({ ...ed, date: v })} placeholder="YYYY-MM-DD" />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Invoice No.</Text>
              <TextInput style={styles.input} value={ed.invNo} onChangeText={(v) => setEd({ ...ed, invNo: v })} />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Invoice Date</Text>
              <TextInput style={styles.input} value={ed.invDate} onChangeText={(v) => setEd({ ...ed, invDate: v })} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Qty</Text>
              <TextInput style={styles.input} value={ed.qty} onChangeText={(v) => setEd({ ...ed, qty: v })} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Rate</Text>
              <TextInput style={styles.input} value={ed.rate} onChangeText={(v) => setEd({ ...ed, rate: v })} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>GST %</Text>
              <TextInput style={styles.input} value={ed.gstPct} onChangeText={(v) => setEd({ ...ed, gstPct: v })} keyboardType="numeric" />
            </View>
          </View>

          <Text style={styles.label}>Pay Status</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={ed.payStatus} onValueChange={(v) => setEd({ ...ed, payStatus: v })} style={styles.picker}>
              <Picker.Item label="Pending" value="pending" />
              <Picker.Item label="Received" value="received" />
              <Picker.Item label="Credit" value="credit" />
            </Picker>
          </View>

          <Text style={styles.label}>Credit Days</Text>
          <TextInput style={styles.input} value={ed.creditDays} onChangeText={(v) => setEd({ ...ed, creditDays: v })} keyboardType="numeric" />

          <Text style={styles.label}>Note</Text>
          <TextInput style={styles.input} value={ed.note} onChangeText={(v) => setEd({ ...ed, note: v })} />

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, busy && styles.btnDisabled]} onPress={confirmEdit} disabled={busy}>
              <Text style={styles.btnText}>{busy ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setEditing(null)}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Section title="📋 Orders Pending Dispatch" list={pending} empty="No orders pending dispatch." />
      <Section title="🚚 Dispatched Orders" list={dispatched} empty="No dispatched orders." />
      {delivered.length > 0 ? <Section title="✅ Delivered" list={delivered} empty="" /> : null}
      {cancelled.length > 0 ? <Section title="🚫 Cancelled" list={cancelled} empty="" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { backgroundColor: '#fff', borderRadius: 12, padding: 12, width: '47%' },
  kpiLabel: { color: '#94a3b8', fontSize: 11 },
  kpiValue: { fontSize: 18, fontWeight: '700', marginTop: 4, color: '#0b1220' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0b1220' },
  countChip: { backgroundColor: '#c2410c', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  countChipText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  formCard: { borderWidth: 1, borderColor: '#0d9488', marginTop: 14 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 3 },
  amount: { fontWeight: '700', fontSize: 15, color: '#0b1220' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  detailLabel: { color: '#94a3b8', fontSize: 11.5 },
  detailVal: { color: '#0b1220', fontSize: 11.5, fontWeight: '600' },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmPrimary: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmWa: { backgroundColor: '#25d366', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmWaText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 10 },
  empty: { color: '#94a3b8', fontSize: 12, paddingVertical: 8 },
});
