import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { buildTelLink } from '@surani/shared';
import type { Party, PartyType, SalesPerson } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

const TYPES: { value: PartyType; label: string }[] = [
  { value: 'debtor', label: 'Debtor (owes you)' },
  { value: 'creditor', label: 'Creditor (you owe)' },
  { value: 'both', label: 'Both' },
  { value: 'transporter', label: 'Transporter' },
  { value: 'handling', label: 'Handling Agent' },
];

const EMPTY = {
  name: '',
  type: 'debtor' as PartyType,
  salesPersonId: '',
  phone: '91',
  email: '',
  gst: '',
  opening: '0',
  creditDays: '0',
  defaultFreight: '0',
  address: '',
  locationUrl: '',
  vehicle: '',
};

export function PartiesScreen() {
  const navigation = useNavigation<any>();
  const can = usePermission();
  const canEditRow = can('edit_parties') || can('edit_transporters');
  const canDelete = can('delete_parties') || can('edit_transporters');
  const canEdit = can('add_parties') || canEditRow || canDelete;
  const [parties, setParties] = useState<Party[]>([]);
  const [query, setQuery] = useState('');
  const [spFilter, setSpFilter] = useState('');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    setParties(await api.parties.list());
  }

  useEffect(() => {
    reload().catch(() => {});
    api.salesPersons.list().then(setSalesPersons).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
    setShowForm(false);
    setError('');
  }

  function onEdit(p: Party) {
    setEditingId(p.id);
    setShowForm(true);
    setError('');
    setForm({
      name: p.name,
      type: p.type,
      salesPersonId: p.salesPersonId || '',
      phone: p.phone || '',
      email: p.email || '',
      gst: p.gst || '',
      opening: String(p.opening ?? 0),
      creditDays: String(p.creditDays ?? 0),
      defaultFreight: String(p.defaultFreight ?? 0),
      address: p.address || '',
      locationUrl: p.locationUrl || '',
      vehicle: p.vehicle || '',
    });
  }

  async function onSave() {
    setError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      salesPersonId: form.salesPersonId || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      gst: form.gst.trim() || null,
      opening: Number(form.opening) || 0,
      creditDays: Number(form.creditDays) || 0,
      defaultFreight: Number(form.defaultFreight) || 0,
      address: form.address.trim() || null,
      locationUrl: form.locationUrl.trim() || null,
      vehicle: form.vehicle.trim() || null,
    };
    setSaving(true);
    try {
      if (editingId) await api.parties.update(editingId, payload);
      else await api.parties.create(payload);
      resetForm();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save party');
    } finally {
      setSaving(false);
    }
  }

  function onDelete(p: Party) {
    Alert.alert('Delete party', `Delete ${p.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.parties.remove(p.id);
            if (editingId === p.id) resetForm();
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete party');
          }
        },
      },
    ]);
  }

  const salesPersonName = (id: string | null) => (id ? salesPersons.find((s) => s.id === id)?.name || '—' : '—');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {canEdit && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ Add Party</Text>
        </TouchableOpacity>
      )}

      {canEdit && showForm && (
        <View style={[styles.card, styles.formCard]}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Party' : 'New Party'}</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => set('name', v)} />

          <Text style={styles.label}>Type</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.type} onValueChange={(v) => set('type', v)} style={styles.picker}>
              {TYPES.map((t) => (
                <Picker.Item key={t.value} label={t.label} value={t.value} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Sales Person</Text>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.salesPersonId} onValueChange={(v) => set('salesPersonId', v)} style={styles.picker}>
              <Picker.Item label="— none —" value="" />
              {salesPersons.map((s) => (
                <Picker.Item key={s.id} label={s.name} value={s.id} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>WhatsApp / Phone</Text>
          <TextInput
            style={styles.input}
            value={form.phone}
            onChangeText={(v) => set('phone', v.replace(/\D/g, '').slice(0, 12))}
            placeholder="e.g. 919876543210"
            keyboardType="phone-pad"
            maxLength={12}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.label}>GST No.</Text>
          <TextInput style={styles.input} value={form.gst} onChangeText={(v) => set('gst', v)} autoCapitalize="characters" />

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Opening Balance (₹)</Text>
              <TextInput style={styles.input} value={form.opening} onChangeText={(v) => set('opening', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Credit Days</Text>
              <TextInput style={styles.input} value={form.creditDays} onChangeText={(v) => set('creditDays', v)} keyboardType="numeric" />
              <Text style={styles.hint}>Sales only. Purchases are due at once.</Text>
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.label}>Default Freight (₹/unit)</Text>
              <TextInput style={styles.input} value={form.defaultFreight} onChangeText={(v) => set('defaultFreight', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Vehicle (transporters)</Text>
              <TextInput style={styles.input} value={form.vehicle} onChangeText={(v) => set('vehicle', v)} />
            </View>
          </View>

          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={form.address} onChangeText={(v) => set('address', v)} />

          <Text style={styles.label}>Location Link (Google Maps)</Text>
          <TextInput
            style={styles.input}
            value={form.locationUrl}
            onChangeText={(v) => set('locationUrl', v)}
            placeholder="https://maps.google.com/..."
            autoCapitalize="none"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onSave} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Party'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={resetForm}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TextInput
        style={[styles.input, { marginBottom: 10 }]}
        value={query}
        onChangeText={setQuery}
        placeholder="🔍 Search by name, phone or GST…"
        placeholderTextColor="#94a3b8"
      />

      <View style={[styles.pickerWrap, { marginBottom: 10 }]}>
        <Picker selectedValue={spFilter} onValueChange={setSpFilter} style={styles.picker}>
          <Picker.Item label="All sales persons" value="" />
          <Picker.Item label="— none assigned —" value="none" />
          {salesPersons.map((s) => (
            <Picker.Item key={s.id} label={s.name} value={s.id} />
          ))}
        </Picker>
      </View>

      {parties
        .filter((p) => {
          if (spFilter === 'none' ? p.salesPersonId : spFilter && p.salesPersonId !== spFilter) return false;
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            p.name.toLowerCase().includes(q) ||
            (p.phone || '').toLowerCase().includes(q) ||
            (p.gst || '').toLowerCase().includes(q)
          );
        })
        .map((p) => (
        <View key={p.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{p.name}</Text>
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{p.type}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailVal}>{p.phone || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sales Person</Text>
            <Text style={styles.detailVal}>{salesPersonName(p.salesPersonId)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>GST</Text>
            <Text style={styles.detailVal}>{p.gst || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Credit Days</Text>
            <Text style={styles.detailVal}>{p.creditDays}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Opening</Text>
            <Text style={styles.detailVal}>₹{Number(p.opening).toFixed(2)}</Text>
          </View>

          <View style={styles.actions}>
            {!!p.phone && (
              <TouchableOpacity
                style={styles.btnSmCall}
                onPress={() => Linking.openURL(buildTelLink(p.phone)).catch(() => {})}
              >
                <Text style={styles.btnSmCallText}>📞 Call</Text>
              </TouchableOpacity>
            )}
            {can('view_ledgers') && (
              <TouchableOpacity style={styles.btnSm} onPress={() => navigation.navigate('PartyLedger', { partyId: p.id })}>
                <Text style={styles.btnSmText}>Ledger</Text>
              </TouchableOpacity>
            )}
            {!!p.locationUrl && (
              <TouchableOpacity style={styles.btnSm} onPress={() => Linking.openURL(p.locationUrl!).catch(() => {})}>
                <Text style={styles.btnSmText}>📍 Map</Text>
              </TouchableOpacity>
            )}
            {canEdit && (
              <>
                {canEditRow && (
                  <TouchableOpacity style={styles.btnSm} onPress={() => onEdit(p)}>
                    <Text style={styles.btnSmText}>Edit</Text>
                  </TouchableOpacity>
                )}
                {canDelete && (
                  <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(p)}>
                    <Text style={styles.btnSmDangerText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      ))}

      {parties.length === 0 ? <Text style={styles.empty}>No parties yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  formCard: { borderWidth: 1, borderColor: '#0d9488' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  typeChip: { backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  typeChipText: { fontSize: 10, color: '#0f766e', fontWeight: '700' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  detailLabel: { color: '#94a3b8', fontSize: 12 },
  detailVal: { color: '#0b1220', fontSize: 12, fontWeight: '600' },

  label: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  hint: { color: '#94a3b8', fontSize: 10, marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 50, color: '#0b1220' },
  row: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnSmCall: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnSmCallText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
