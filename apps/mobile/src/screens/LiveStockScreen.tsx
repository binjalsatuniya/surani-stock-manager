import { fmtMoney } from '@surani/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Item, StockLevel } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function LiveStockScreen() {
  const can = usePermission();
  const canEdit = can('edit_rate');
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [rateEdits, setRateEdits] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    const [its, levels] = await Promise.all([api.items.list(), api.items.stock()]);
    setItems(its);
    setStock(Object.fromEntries(levels.map((l: StockLevel) => [l.itemId, l.qty])));
  }

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  // Saving a rate also stamps rateDate, so Live Stock doubles as the rate-of-the-day screen.
  async function onUpdateRate(id: string) {
    const raw = rateEdits[id];
    if (raw === undefined || raw === '') return;
    setError('');
    setBusyId(id);
    try {
      await api.items.update(id, { rate: Number(raw) || 0, rateDate: new Date().toISOString().slice(0, 10) });
      setRateEdits((r) => {
        const next = { ...r };
        delete next[id];
        return next;
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update rate');
    } finally {
      setBusyId('');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.note}>
        Live stock = opening + total inward − total outward (cancelled orders excluded). Items in red are at or below
        their reorder level.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {items.map((i) => {
        const qty = stock[i.id] ?? 0;
        const low = i.reorder > 0 && qty <= i.reorder;
        return (
          <View key={i.id} style={[styles.card, low && styles.cardLow]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>
                {i.name}
                {low ? <Text style={styles.lowTag}>  • low</Text> : null}
              </Text>
              <Text style={styles.qty}>
                {qty} {i.unit}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reorder Level</Text>
              <Text style={styles.detailVal}>{i.reorder}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Current Rate</Text>
              <Text style={styles.detailVal}>{fmtMoney(i.rate)}</Text>
            </View>

            {canEdit && (
              <View style={styles.rateRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={rateEdits[i.id] ?? ''}
                  onChangeText={(v) => setRateEdits((r) => ({ ...r, [i.id]: v }))}
                  placeholder={`Update rate (${i.rate})`}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={[styles.btnSm, busyId === i.id && styles.btnDisabled]}
                  onPress={() => onUpdateRate(i.id)}
                  disabled={busyId === i.id}
                >
                  <Text style={styles.btnSmText}>{busyId === i.id ? '…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
      {items.length === 0 ? <Text style={styles.empty}>No items yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  note: { color: '#64748b', fontSize: 12, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardLow: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#0b1220' },
  lowTag: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
  qty: { fontWeight: '800', fontSize: 15, color: '#0b1220' },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  detailLabel: { color: '#94a3b8', fontSize: 12 },
  detailVal: { color: '#0b1220', fontSize: 12, fontWeight: '600' },

  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' },
  btnSm: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 },
  btnSmText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnDisabled: { opacity: 0.6 },

  error: { color: '#dc2626', fontSize: 12.5, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 20, fontSize: 12.5 },
});
