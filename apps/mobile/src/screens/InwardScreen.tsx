import { fmtMoney } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { DeliveryType, Inward, Item, Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { SearchSelect } from '../components/SearchSelect';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';
import { useAuth } from '../context/AuthContext';

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => fmtMoney(n);

const EMPTY = {
  date: today(),
  partyId: '',
  itemId: '',
  qty: '',
  rate: '',
  gstPct: '18',
  deliveryType: '' as '' | DeliveryType,
  transporterId: '',
  freightRate: '0',
  vehicle: '',
  note: '',
};

/** A label with the red asterisk the web form shows when Field Rules make a field mandatory. */
function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.req}> *</Text> : null}
    </Text>
  );
}

export function InwardScreen() {
  const can = usePermission();
  const { user } = useAuth();
  const canDelete = can('delete_inward');
  const canEdit = can('add_inward') || can('edit_inward') || canDelete;
  const canEditInvoice = user?.role === 'superadmin' || user?.role === 'admin';
  const { required } = useFieldSettings();

  const [rows, setRows] = useState<Inward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 2 — "Mark as Inward": capture invoice + handling, then finalize.
  const [marking, setMarking] = useState<Inward | null>(null);
  const [mk, setMk] = useState({ invNo: '', invDate: '', handlingAgentId: '', handlingRate: '0' });

  // Inline edit (admin / superadmin only).
  const [editing, setEditing] = useState<Inward | null>(null);
  const [ed, setEd] = useState({
    date: '', partyId: '', itemId: '', invNo: '', invDate: '', qty: '', rate: '', gstPct: '',
    deliveryType: '' as '' | DeliveryType, transporterId: '', freightRate: '',
    handlingAgentId: '', handlingRate: '', vehicle: '', note: '',
  });

  async function reload() {
    setRows(await api.inward.list());
  }

  useEffect(() => {
    reload().catch(() => {});
    api.parties.list('creditor').then(setParties).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.parties.list('transporter').then(setTransporters).catch(() => {});
    api.parties.list('handling').then(setHandlers).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Auto-fill the item's rate when an item is chosen and no rate typed yet.
  function onItemChange(id: string) {
    const it = items.find((i) => i.id === id);
    setForm((f) => ({
      ...f,
      itemId: id,
      rate: f.rate || (it ? String(it.rate) : ''),
      gstPct: it && Number(it.gstPct) > 0 ? String(it.gstPct) : f.gstPct,
    }));
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  const qtyN = Number(form.qty) || 0;
  const rateN = Number(form.rate) || 0;
  const gstN = Number(form.gstPct) || 0;
  const freightN = Number(form.freightRate) || 0;
  const goods = qtyN * rateN;
  const freightTotal = freightN * qtyN;
  const amountPreview = goods + (goods * gstN) / 100;

  /* ---------- step 1: save as pending ---------- */

  async function onAdd() {
    setError('');
    if (!form.partyId || !form.itemId || !form.qty || !form.rate) {
      setError('Party, item, qty and rate are required.');
      return;
    }
    if (required('inward.deliveryType') && !form.deliveryType) return setError('Delivery type is required.');
    if (required('inward.transporter') && !form.transporterId) return setError('Transporter is required.');
    if (required('inward.vehicle') && !form.vehicle.trim()) return setError('Vehicle / LR no. is required.');
    if (required('inward.note') && !form.note.trim()) return setError('Note is required.');
    setSaving(true);
    try {
      await api.inward.create({
        date: form.date,
        partyId: form.partyId,
        itemId: form.itemId,
        qty: Number(form.qty),
        rate: Number(form.rate),
        gstPct: Number(form.gstPct) || 0,
        deliveryType: form.deliveryType || null,
        transporterId: form.transporterId || null,
        freightRate: Number(form.freightRate) || 0,
        vehicle: form.vehicle.trim() || null,
        note: form.note.trim() || null,
      });
      setForm((f) => ({ ...EMPTY, date: f.date }));
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add inward entry');
    } finally {
      setSaving(false);
    }
  }

  /* ---------- step 2: mark as inward ---------- */

  function openMark(r: Inward) {
    setEditing(null);
    setMarking(r);
    setError('');
    setMk({
      invNo: r.invNo || '',
      invDate: r.invDate || today(),
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
    setSaving(true);
    try {
      await api.inward.mark(marking.id, {
        invNo: mk.invNo.trim() || null,
        invDate: mk.invDate || null,
        handlingAgentId: mk.handlingAgentId || null,
        handlingRate: Number(mk.handlingRate) || 0,
      });
      setMarking(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as inward');
    } finally {
      setSaving(false);
    }
  }

  /* ---------- edit / delete ---------- */

  function openEdit(r: Inward) {
    setMarking(null);
    setEditing(r);
    setError('');
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
    setSaving(true);
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
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit inward entry');
    } finally {
      setSaving(false);
    }
  }

  function onDelete(r: Inward) {
    Alert.alert('Delete inward', `Delete this entry for ${partyName(r.partyId)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.inward.remove(r.id);
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete inward entry');
          }
        },
      },
    ]);
  }

  /* ---------- rendering ---------- */

  const pendingRows = rows.filter((r) => r.status === 'pending');
  const receivedRows = rows.filter((r) => r.status !== 'pending');

  function inwardCard(r: Inward) {
    return (
      <View key={r.id} style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{partyName(r.partyId)}</Text>
          <Text style={styles.amount}>{inr(Number(r.amount))}</Text>
        </View>
        <Text style={styles.cardSub}>
          {itemName(r.itemId)} · {r.date}
        </Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Qty × Rate</Text>
          <Text style={styles.detailVal}>
            {r.qty} × {inr(Number(r.rate))}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>GST</Text>
          <Text style={styles.detailVal}>{inr(Number(r.gst))}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Freight</Text>
          <Text style={styles.detailVal}>{inr(Number(r.freight))}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Handling</Text>
          <Text style={styles.detailVal}>{inr(Number(r.handling))}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Invoice No.</Text>
          <Text style={styles.detailVal}>{r.invNo || '—'}</Text>
        </View>

        {canEdit && (
          <View style={styles.actions}>
            {r.status === 'pending' && (
              <TouchableOpacity style={styles.btnSmPrimary} onPress={() => openMark(r)}>
                <Text style={styles.btnSmPrimaryText}>Mark as Inward</Text>
              </TouchableOpacity>
            )}
            {canEditInvoice && (
              <TouchableOpacity style={styles.btnSm} onPress={() => openEdit(r)}>
                <Text style={styles.btnSmText}>Edit</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(r)}>
                <Text style={styles.btnSmDangerText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {canEdit && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ New Inward Entry</Text>
        </TouchableOpacity>
      )}

      {canEdit && showForm && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>New Inward</Text>

          <Label>Date</Label>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" />

          <Label>Party (creditor) *</Label>
          <SearchSelect
            value={form.partyId}
            onChange={(v) => set('partyId', v)}
            options={parties.map((p) => ({ id: p.id, label: p.name }))}
            placeholder="Select…"
          />

          <Label>Item *</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.itemId} onValueChange={onItemChange} style={styles.picker}>
              <Picker.Item label="Select…" value="" />
              {items.map((i) => (
                <Picker.Item key={i.id} label={i.name} value={i.id} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Qty *</Label>
              <TextInput style={styles.input} value={form.qty} onChangeText={(v) => set('qty', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>Rate *</Label>
              <TextInput style={styles.input} value={form.rate} onChangeText={(v) => set('rate', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>GST %</Label>
              <TextInput style={styles.input} value={form.gstPct} onChangeText={(v) => set('gstPct', v)} keyboardType="numeric" />
            </View>
          </View>

          <Label required={required('inward.deliveryType')}>Delivery</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.deliveryType} onValueChange={(v) => set('deliveryType', v)} style={styles.picker}>
              <Picker.Item label="—" value="" />
              <Picker.Item label="Ex Works" value="ExWorks" />
              <Picker.Item label="FOR" value="FOR" />
            </Picker>
          </View>

          <Label required={required('inward.transporter')}>Transporter</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.transporterId} onValueChange={(v) => set('transporterId', v)} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {transporters.map((t) => (
                <Picker.Item key={t.id} label={t.name} value={t.id} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Freight (₹/unit)</Label>
              <TextInput style={styles.input} value={form.freightRate} onChangeText={(v) => set('freightRate', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label required={required('inward.vehicle')}>Vehicle</Label>
              <TextInput style={styles.input} value={form.vehicle} onChangeText={(v) => set('vehicle', v)} />
            </View>
          </View>

          <Label required={required('inward.note')}>Note</Label>
          <TextInput style={styles.input} value={form.note} onChangeText={(v) => set('note', v)} />

          {qtyN > 0 && rateN > 0 && (
            <View style={styles.breakdown}>
              <Text style={styles.breakdownHead}>AMOUNT BREAKDOWN</Text>
              <View style={styles.bdRow}>
                <Text style={styles.bdLabel}>
                  Goods value ({qtyN} × {inr(rateN)})
                </Text>
                <Text style={styles.bdVal}>{inr(goods)}</Text>
              </View>
              <View style={styles.bdRow}>
                <Text style={styles.bdLabel}>GST ({gstN}%)</Text>
                <Text style={styles.bdVal}>{inr((goods * gstN) / 100)}</Text>
              </View>
              <View style={styles.bdDivider} />
              <View style={styles.bdRow}>
                <Text style={styles.bdTotalLabel}>Total payable</Text>
                <Text style={styles.bdTotalVal}>{inr(amountPreview)}</Text>
              </View>
              <View style={styles.bdRefBox}>
                <Text style={styles.bdRefHead}>FOR REFERENCE ONLY (NOT ADDED ABOVE)</Text>
                <View style={styles.bdRow}>
                  <Text style={styles.bdLabel}>
                    Transportation ({qtyN} × {inr(freightN)})
                  </Text>
                  <Text style={styles.bdVal}>{inr(freightTotal)}</Text>
                </View>
                <Text style={styles.hint}>Handling charges & invoice details are added in the “Mark as Inward” step.</Text>
              </View>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onAdd} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save (Pending)'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGhost, styles.col]}
              onPress={() => {
                setForm({ ...EMPTY });
                setShowForm(false);
                setError('');
              }}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Records a pending entry. Use “Mark as Inward” below once the goods & invoice arrive.</Text>
        </View>
      )}

      {!showForm && error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Step 2 form */}
      {marking && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>
            Mark as Inward — {partyName(marking.partyId)} · {itemName(marking.itemId)}
          </Text>

          <Label required={required('inward.invNo')}>Invoice No.</Label>
          <TextInput style={styles.input} value={mk.invNo} onChangeText={(v) => setMk({ ...mk, invNo: v })} />

          <Label required={required('inward.invDate')}>Invoice Date</Label>
          <TextInput style={styles.input} value={mk.invDate} onChangeText={(v) => setMk({ ...mk, invDate: v })} placeholder="YYYY-MM-DD" />

          <Label required={required('inward.handlingAgent')}>Handling Agent</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={mk.handlingAgentId} onValueChange={(v) => setMk({ ...mk, handlingAgentId: v })} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {handlers.map((h) => (
                <Picker.Item key={h.id} label={h.name} value={h.id} />
              ))}
            </Picker>
          </View>

          <Label>Handling (₹/MT)</Label>
          <TextInput style={styles.input} value={mk.handlingRate} onChangeText={(v) => setMk({ ...mk, handlingRate: v })} keyboardType="numeric" />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={confirmMark} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Confirm'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setMarking(null)}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Edit form */}
      {editing && canEditInvoice && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>
            Edit Inward — {partyName(editing.partyId)} · {itemName(editing.itemId)}
          </Text>

          <Label>Date</Label>
          <TextInput style={styles.input} value={ed.date} onChangeText={(v) => setEd({ ...ed, date: v })} placeholder="YYYY-MM-DD" />

          <Label>Party (creditor)</Label>
          <SearchSelect
            value={ed.partyId}
            onChange={(v) => setEd({ ...ed, partyId: v })}
            options={parties.map((p) => ({ id: p.id, label: p.name }))}
            placeholder="Select…"
          />

          <Label>Item</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={ed.itemId} onValueChange={(v) => setEd({ ...ed, itemId: v })} style={styles.picker}>
              {items.map((i) => (
                <Picker.Item key={i.id} label={i.name} value={i.id} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Qty</Label>
              <TextInput style={styles.input} value={ed.qty} onChangeText={(v) => setEd({ ...ed, qty: v })} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>Rate</Label>
              <TextInput style={styles.input} value={ed.rate} onChangeText={(v) => setEd({ ...ed, rate: v })} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>GST %</Label>
              <TextInput style={styles.input} value={ed.gstPct} onChangeText={(v) => setEd({ ...ed, gstPct: v })} keyboardType="numeric" />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Invoice No.</Label>
              <TextInput style={styles.input} value={ed.invNo} onChangeText={(v) => setEd({ ...ed, invNo: v })} />
            </View>
            <View style={styles.col}>
              <Label>Invoice Date</Label>
              <TextInput style={styles.input} value={ed.invDate} onChangeText={(v) => setEd({ ...ed, invDate: v })} placeholder="YYYY-MM-DD" />
            </View>
          </View>

          <Label>Delivery</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={ed.deliveryType} onValueChange={(v) => setEd({ ...ed, deliveryType: v as '' | DeliveryType })} style={styles.picker}>
              <Picker.Item label="—" value="" />
              <Picker.Item label="Ex Works" value="ExWorks" />
              <Picker.Item label="FOR" value="FOR" />
            </Picker>
          </View>

          <Label>Transporter</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={ed.transporterId} onValueChange={(v) => setEd({ ...ed, transporterId: v })} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {transporters.map((t) => (
                <Picker.Item key={t.id} label={t.name} value={t.id} />
              ))}
            </Picker>
          </View>

          <Label>Handling Agent</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={ed.handlingAgentId} onValueChange={(v) => setEd({ ...ed, handlingAgentId: v })} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {handlers.map((h) => (
                <Picker.Item key={h.id} label={h.name} value={h.id} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Freight (₹/unit)</Label>
              <TextInput style={styles.input} value={ed.freightRate} onChangeText={(v) => setEd({ ...ed, freightRate: v })} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>Handling (₹/MT)</Label>
              <TextInput style={styles.input} value={ed.handlingRate} onChangeText={(v) => setEd({ ...ed, handlingRate: v })} keyboardType="numeric" />
            </View>
          </View>

          <Label>Vehicle</Label>
          <TextInput style={styles.input} value={ed.vehicle} onChangeText={(v) => setEd({ ...ed, vehicle: v })} />

          <Label>Note</Label>
          <TextInput style={styles.input} value={ed.note} onChangeText={(v) => setEd({ ...ed, note: v })} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={confirmEdit} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={() => setEditing(null)}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Pending — recorded but not yet marked as inward */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>⏳ Pending Orders</Text>
        {pendingRows.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingRows.length}</Text>
          </View>
        )}
      </View>
      <Text style={styles.sectionSub}>Awaiting “Mark as Inward”</Text>
      {pendingRows.map(inwardCard)}
      {pendingRows.length === 0 ? <Text style={styles.empty}>No pending orders.</Text> : null}

      {/* Received — finalized inward entries */}
      <View style={[styles.sectionHead, styles.sectionDivider]}>
        <Text style={styles.sectionTitle}>✅ Received Inward</Text>
      </View>
      <Text style={styles.sectionSub}>Counted in stock &amp; dues</Text>
      {receivedRows.map(inwardCard)}
      {receivedRows.length === 0 ? <Text style={styles.empty}>No received inward entries yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  accentCard: { borderWidth: 1, borderColor: '#0d9488' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
  amount: { fontWeight: '800', fontSize: 15, color: '#0b1220' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  detailLabel: { color: '#94a3b8', fontSize: 12 },
  detailVal: { color: '#0b1220', fontSize: 12, fontWeight: '600' },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  req: { color: '#ef4444', fontWeight: '700' },
  hint: { color: '#94a3b8', fontSize: 10.5, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  breakdown: { marginTop: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 14 },
  breakdownHead: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: '#64748b', marginBottom: 10 },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bdLabel: { color: '#475569', fontSize: 12.5, flex: 1 },
  bdVal: { fontSize: 12.5, color: '#0b1220' },
  bdDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 6 },
  bdTotalLabel: { fontWeight: '700', fontSize: 14, color: '#0b1220' },
  bdTotalVal: { fontWeight: '700', fontSize: 14, color: '#ef4444' },
  bdRefBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', borderStyle: 'dashed' },
  bdRefHead: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, color: '#94a3b8', marginBottom: 6 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionDivider: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  sectionTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  sectionSub: { color: '#94a3b8', fontSize: 11.5, marginBottom: 10, marginTop: 2 },
  badge: { backgroundColor: '#c2410c', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmPrimary: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 10, marginBottom: 10, fontSize: 12.5 },
});
