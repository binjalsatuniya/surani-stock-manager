import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { Item, ItemUnit } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useFieldSettings } from '../hooks/useFieldSettings';

const UNITS: ItemUnit[] = ['KG', 'MT', 'pcs'];

const EMPTY = {
  name: '',
  category: '',
  unit: 'KG' as ItemUnit,
  code: '',
  gstPct: '0',
  rate: '0',
  opening: '0',
  reorder: '0',
  tdsAttachment: '',
  tdsAttachmentName: '',
};

function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return { mime: 'application/octet-stream', base64: '' };
  return { mime: match[1] || 'application/octet-stream', base64: match[2] || '' };
}
const extForMime = (mime: string) => (mime.includes('pdf') ? 'pdf' : mime.includes('png') ? 'png' : 'jpg');

/** A label with the red asterisk the web form shows when Field Rules make a field mandatory. */
function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}
      {required ? <Text style={styles.req}> *</Text> : null}
    </Text>
  );
}

export function ItemsScreen() {
  const can = usePermission();
  const { required } = useFieldSettings();
  const canEditRow = can('edit_items');
  const canDelete = can('delete_items');
  const canEdit = can('add_items') || canEditRow || canDelete;
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    setItems(await api.items.list());
  }

  useEffect(() => {
    reload().catch(() => {});
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

  async function onSave() {
    setError('');
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (required('item.category') && !form.category.trim()) return setError('Category is required.');
    if (required('item.code') && !form.code.trim()) return setError('Code / HSN is required.');
    if (required('item.reorder') && !(Number(form.reorder) > 0)) return setError('Reorder / low-stock level is required.');
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit,
      code: form.code.trim() || null,
      gstPct: Number(form.gstPct) || 0,
      rate: Number(form.rate) || 0,
      opening: Number(form.opening) || 0,
      reorder: Number(form.reorder) || 0,
      rateDate: null,
      tdsAttachment: form.tdsAttachment || null,
      tdsAttachmentName: form.tdsAttachmentName || null,
    };
    setSaving(true);
    try {
      if (editingId) await api.items.update(editingId, payload);
      else await api.items.create(payload);
      resetForm();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  function onEdit(i: Item) {
    setEditingId(i.id);
    setShowForm(true);
    setError('');
    setForm({
      name: i.name,
      category: i.category || '',
      unit: i.unit,
      code: i.code || '',
      gstPct: String(i.gstPct ?? 0),
      rate: String(i.rate ?? 0),
      opening: String(i.opening ?? 0),
      reorder: String(i.reorder ?? 0),
      tdsAttachment: i.tdsAttachment || '',
      tdsAttachmentName: i.tdsAttachmentName || '',
    });
  }

  async function pickTds() {
    setError('');
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > 5 * 1024 * 1024) {
      setError('TDS file is too large (max 5 MB).');
      return;
    }
    try {
      const base64 = new File(a.uri).base64Sync();
      set('tdsAttachment', `data:${a.mimeType || 'application/pdf'};base64,${base64}`);
      set('tdsAttachmentName', a.name || 'TDS.pdf');
    } catch {
      setError('Could not read that file. Please try another one.');
    }
  }

  // Share the TDS via the phone's share sheet (pick WhatsApp → pick the party → the file is attached).
  async function shareTds(i: Item) {
    if (!i.tdsAttachment) return;
    const { mime, base64 } = splitDataUrl(i.tdsAttachment);
    const name = i.tdsAttachmentName || `${i.name}-TDS.${extForMime(mime)}`;
    try {
      const file = new File(Paths.cache, name);
      if (file.exists) file.delete();
      file.create();
      file.write(base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: `Send TDS — ${i.name}` });
      else await Linking.openURL(file.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share the TDS.');
    }
  }

  function onDelete(i: Item) {
    Alert.alert('Delete item', `Delete ${i.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.items.remove(i.id);
            if (editingId === i.id) resetForm();
            await reload();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to delete item');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {canEdit && !showForm && (
        <TouchableOpacity style={styles.btn} onPress={() => setShowForm(true)}>
          <Text style={styles.btnText}>＋ Add Item</Text>
        </TouchableOpacity>
      )}

      {canEdit && showForm && (
        <View style={[styles.card, styles.accentCard]}>
          <Text style={styles.cardTitle}>{editingId ? 'Edit Item' : 'New Item'}</Text>

          <Label>Name *</Label>
          <TextInput style={styles.input} value={form.name} onChangeText={(v) => set('name', v)} />

          <Label required={required('item.category')}>Category</Label>
          <TextInput style={styles.input} value={form.category} onChangeText={(v) => set('category', v)} />

          <Label required={required('item.code')}>HSN Code</Label>
          <TextInput style={styles.input} value={form.code} onChangeText={(v) => set('code', v)} autoCapitalize="characters" />

          <Label>GST %</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.gstPct} onValueChange={(v) => set('gstPct', String(v))} style={styles.picker}>
              {['0', '5', '12', '18', '28'].map((g) => (
                <Picker.Item key={g} label={`${g}%`} value={g} />
              ))}
            </Picker>
          </View>

          <Label>Unit</Label>
          <View style={styles.pickerWrap}>
            <Picker selectedValue={form.unit} onValueChange={(v) => set('unit', v)} style={styles.picker}>
              {UNITS.map((u) => (
                <Picker.Item key={u} label={u} value={u} />
              ))}
            </Picker>
          </View>

          <View style={styles.row}>
            <View style={styles.col}>
              <Label>Rate</Label>
              <TextInput style={styles.input} value={form.rate} onChangeText={(v) => set('rate', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label>Opening Qty</Label>
              <TextInput style={styles.input} value={form.opening} onChangeText={(v) => set('opening', v)} keyboardType="numeric" />
            </View>
            <View style={styles.col}>
              <Label required={required('item.reorder')}>Reorder</Label>
              <TextInput style={styles.input} value={form.reorder} onChangeText={(v) => set('reorder', v)} keyboardType="numeric" />
            </View>
          </View>

          <Label>TDS (Technical Data Sheet)</Label>
          <TouchableOpacity style={styles.attachBtn} onPress={pickTds}>
            <Text style={styles.attachBtnText}>{form.tdsAttachmentName ? `📄 ${form.tdsAttachmentName}` : '📎 Attach PDF / image'}</Text>
          </TouchableOpacity>
          {form.tdsAttachmentName ? (
            <TouchableOpacity onPress={() => { set('tdsAttachment', ''); set('tdsAttachmentName', ''); }}>
              <Text style={styles.removeLink}>remove</Text>
            </TouchableOpacity>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.col, saving && styles.btnDisabled]} onPress={onSave} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Item'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnGhost, styles.col]} onPress={resetForm}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showForm && error ? <Text style={styles.error}>{error}</Text> : null}

      {items.map((i) => (
        <View key={i.id} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{i.name}</Text>
            <View style={styles.unitChip}>
              <Text style={styles.unitChipText}>{i.unit}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <Text style={styles.detailVal}>{i.category || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Code</Text>
            <Text style={styles.detailVal}>{i.code || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Rate</Text>
            <Text style={styles.detailVal}>₹{Number(i.rate).toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Opening</Text>
            <Text style={styles.detailVal}>{i.opening}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reorder</Text>
            <Text style={styles.detailVal}>{i.reorder}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>TDS</Text>
            <Text style={styles.detailVal}>{i.tdsAttachment ? 'Attached' : '—'}</Text>
          </View>

          {i.tdsAttachment ? (
            <TouchableOpacity style={styles.btnWhatsapp} onPress={() => shareTds(i)}>
              <Text style={styles.btnWhatsappText}>📤 Send TDS on WhatsApp</Text>
            </TouchableOpacity>
          ) : null}

          {canEdit && (
            <View style={styles.actions}>
              {canEditRow && (
                <TouchableOpacity style={styles.btnSm} onPress={() => onEdit(i)}>
                  <Text style={styles.btnSmText}>Edit</Text>
                </TouchableOpacity>
              )}
              {canDelete && (
                <TouchableOpacity style={styles.btnSmDanger} onPress={() => onDelete(i)}>
                  <Text style={styles.btnSmDangerText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      ))}
      {items.length === 0 ? <Text style={styles.empty}>No items yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  accentCard: { borderWidth: 1, borderColor: '#0d9488' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  unitChip: { backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  unitChipText: { fontSize: 10, color: '#0f766e', fontWeight: '700' },

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

  btn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnGhostText: { color: '#475569', fontWeight: '700' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnSm: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  btnSmText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  btnSmDanger: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  btnSmDangerText: { color: '#dc2626', fontWeight: '700', fontSize: 12 },

  error: { color: '#dc2626', fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 20, fontSize: 12.5 },

  attachBtn: { borderWidth: 1, borderColor: '#0d9488', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f0fdfa' },
  attachBtnText: { color: '#0f766e', fontWeight: '600', fontSize: 12.5 },
  removeLink: { color: '#dc2626', fontSize: 11.5, marginTop: 4 },
  btnWhatsapp: { backgroundColor: '#25d366', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  btnWhatsappText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
});
