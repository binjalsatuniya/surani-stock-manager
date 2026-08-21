import { fmtMoney } from '@surani/shared';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { Item, Outward, Party, PayStatus } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => fmtMoney(n);

const EMPTY = {
  date: today(),
  partyId: '',
  itemId: '',
  qty: '',
  rate: '',
  gstPct: '18',
  freightRate: '0',
  handlingRate: '0',
  handlingAgentId: '',
  payStatus: 'pending' as PayStatus,
  creditDays: '0',
  invNo: '',
  transporterId: '',
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

export function OutwardScreen() {
  const can = usePermission();
  const canDelete = can('delete_outward');
  const canEdit = can('add_outward') || can('edit_outward') || canDelete;
  const { required } = useFieldSettings();

  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [handlers, setHandlers] = useState<Party[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    setRows(await api.outward.list());
    api.items
      .stock()
      .then((levels) => setStock(Object.fromEntries(levels.map((l) => [l.itemId, l.qty]))))
      .catch(() => {});
  }

  useEffect(() => {
    reload().catch(() => {});
    api.parties.list('debtor').then(setParties).catch(() => {});
    api.items.list().then(setItems).catch(() => {});
    api.parties.list('transporter').then(setTransporters).catch(() => {});
    api.parties.list('handling').then(setHandlers).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Pick up the item's rate when one is chosen and no rate typed yet.
  function onItemChange(id: string) {
    const it = items.find((i) => i.id === id);
    setForm((f) => ({
      ...f,
      itemId: id,
      rate: f.rate || (it ? String(it.rate) : ''),
      gstPct: it && Number(it.gstPct) > 0 ? String(it.gstPct) : f.gstPct,
    }));
  }

  function onPartyChange(id: string) {
    const p = parties.find((x) => x.id === id);
    const creditDays = p ? p.creditDays ?? 0 : 0;
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
    if (!form.partyId || !form.itemId || !form.qty || !form.rate) {
      setError('Party, item, qty and rate are required.');
      return;
    }
    if (required('outward.invNo') && !form.invNo.trim()) return setError('Invoice number is required.');
    if (required('outward.transporter') && !form.transporterId) return setError('Transporter is required.');
    if (required('outward.handlingAgent') && !form.handlingAgentId) return setError('Handling agent is required.');
    if (required('outward.note') && !form.note.trim()) return setError('Note is required.');
    setSaving(true);
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
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add outward entry');
    } finally {
      setSaving(false);
    }
  }

  function onDelete(r: Outward) {
    Alert.alert('Delete outward', `Delete this entry for ${partyName(r.partyId)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.outward.remove(r.id);
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete outward entry');
          }
        },
      },
    ]);
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  const selectedItem = items.find((i) => i.id === form.itemId);
  const available = stock[form.itemId] ?? 0;
  const short = qtyN > 0 && qtyN > available;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {canEdit && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ New Outward Entry</Text>
        </TouchableOpacity>
      )}

      {canEdit && showForm && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>New Outward</Text>

          <Label>Date</Label>
          <TextInput style={styles.input} value={form.date} onChangeText={(v) => set('date', v)} placeholder="YYYY-MM-DD" />

          <Label>Party (debtor) *</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.partyId} onValueChange={onPartyChange} style={styles.picker}>
              <Picker.Item label="Select…" value="" />
              {parties.map((p) => (
                <Picker.Item key={p.id} label={p.name} value={p.id} />
              ))}
            </Picker>
          </View>

          <Label>Item *</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.itemId} onValueChange={onItemChange} style={styles.picker}>
              <Picker.Item label="Select…" value="" />
              {items.map((i) => (
                <Picker.Item key={i.id} label={i.name} value={i.id} />
              ))}
            </Picker>
          </View>
          {!!form.itemId && (
            <View style={[styles.stockChip, short ? styles.stockChipShort : styles.stockChipOk]}>
              <Text style={[styles.stockChipText, short ? styles.stockTextShort : styles.stockTextOk]}>
                Live stock: {available} {selectedItem?.unit || ''}
                {short ? ' · not enough!' : ''}
              </Text>
            </View>
          )}

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

          <Label>Pay Status</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.payStatus} onValueChange={(v) => set('payStatus', v)} style={styles.picker}>
              <Picker.Item label="Pending" value="pending" />
              <Picker.Item label="Received" value="received" />
              <Picker.Item label="Credit" value="credit" />
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Credit Days</Label>
              <TextInput style={styles.input} value={form.creditDays} onChangeText={(v) => set('creditDays', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label required={required('outward.invNo')}>Invoice No.</Label>
              <TextInput style={styles.input} value={form.invNo} onChangeText={(v) => set('invNo', v)} />
            </View>
          </View>

          <Label required={required('outward.transporter')}>Transporter</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.transporterId} onValueChange={(v) => set('transporterId', v)} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {transporters.map((t) => (
                <Picker.Item key={t.id} label={t.name} value={t.id} />
              ))}
            </Picker>
          </View>

          <Label required={required('outward.handlingAgent')}>Handling Agent</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.handlingAgentId} onValueChange={(v) => set('handlingAgentId', v)} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {handlers.map((h) => (
                <Picker.Item key={h.id} label={h.name} value={h.id} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Freight (₹/unit)</Label>
              <TextInput style={styles.input} value={form.freightRate} onChangeText={(v) => set('freightRate', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>Handling (₹/MT)</Label>
              <TextInput style={styles.input} value={form.handlingRate} onChangeText={(v) => set('handlingRate', v)} keyboardType="numeric" />
            </View>
          </View>

          <Label required={required('outward.note')}>Note</Label>
          <TextInput style={styles.input} value={form.note} onChangeText={(v) => set('note', v)} />

          {qtyN > 0 && rateN > 0 && (
            <Text style={styles.preview}>
              Goods value {inr(goods)} · with GST {inr(amountPreview)}
            </Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onAdd} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : 'Add Outward'}</Text>
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
        </View>
      )}

      {!showForm && error ? <Text style={styles.error}>{error}</Text> : null}

      {rows.map((r) => (
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
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Pay Status</Text>
            <Text style={styles.detailVal}>{r.payStatus}</Text>
          </View>

          {canEdit && canDelete && (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(r)}>
                <Text style={styles.btnSmDangerText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
      {rows.length === 0 ? <Text style={styles.empty}>No outward entries yet.</Text> : null}
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
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  preview: { color: '#475569', fontSize: 12.5, marginTop: 12, fontWeight: '600' },

  stockChip: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  stockChipOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  stockChipShort: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  stockChipText: { fontSize: 11.5, fontWeight: '700' },
  stockTextOk: { color: '#15803d' },
  stockTextShort: { color: '#dc2626' },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 20, fontSize: 12.5 },
});
