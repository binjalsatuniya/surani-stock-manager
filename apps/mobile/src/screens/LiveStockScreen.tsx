import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Item, StockLevel } from '@surani/shared';
import { api } from '../lib/apiClient';

export function LiveStockScreen() {
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});

  async function reload() {
    const [its, levels] = await Promise.all([api.items.list(), api.items.stock()]);
    setItems(its);
    setStock(Object.fromEntries(levels.map((l: StockLevel) => [l.itemId, l.qty])));
  }

  useEffect(() => {
    reload();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.note}>Live stock = opening + inward − outward (cancelled excluded). Red = at/below reorder level.</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: i }) => {
          const qty = stock[i.id] ?? 0;
          const low = i.reorder > 0 && qty <= i.reorder;
          return (
            <View style={[styles.card, low && styles.cardLow]}>
              <Text style={styles.cardTitle}>
                {i.name}
                {low ? '  • low' : ''}
              </Text>
              <Text style={styles.cardSub}>
                Stock {qty} {i.unit} · Reorder {i.reorder} · Rate ₹{i.rate}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No items yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  note: { color: '#64748b', fontSize: 12, padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardLow: { backgroundColor: '#fee2e2' },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
