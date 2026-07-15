import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { Item, Outward, Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function OrderBookScreen() {
  const can = usePermission();
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [partyId, setPartyId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');

  async function reload() {
    setRows(await api.orderbook.list());
  }

  useEffect(() => {
    reload();
    api.parties.list('debtor').then(setParties);
    api.items.list().then(setItems);
  }, []);

  async function onPlaceOrder() {
    if (!partyId || !itemId || !qty || !rate) return;
    await api.orders.place({
      date: new Date().toISOString().slice(0, 10),
      partyId,
      itemId,
      qty: Number(qty),
      rate: Number(rate),
      deliveryType: 'ExWorks',
    });
    setQty('');
    setRate('');
    reload();
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  return (
    <View style={styles.container}>
      {can('place_order') && (
        <View style={styles.form}>
          <Picker selectedValue={partyId} onValueChange={setPartyId} style={styles.picker}>
            <Picker.Item label="Select party…" value="" />
            {parties.map((p) => (
              <Picker.Item key={p.id} label={p.name} value={p.id} />
            ))}
          </Picker>
          <Picker selectedValue={itemId} onValueChange={setItemId} style={styles.picker}>
            <Picker.Item label="Select item…" value="" />
            {items.map((i) => (
              <Picker.Item key={i.id} label={i.name} value={i.id} />
            ))}
          </Picker>
          <View style={styles.row}>
            <TextInput style={styles.inputSmall} placeholder="Qty" keyboardType="numeric" value={qty} onChangeText={setQty} />
            <TextInput style={styles.inputSmall} placeholder="Rate" keyboardType="numeric" value={rate} onChangeText={setRate} />
          </View>
          <TouchableOpacity style={styles.button} onPress={onPlaceOrder}>
            <Text style={styles.buttonText}>Place Order</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: m }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {partyName(m.partyId)} · {itemName(m.itemId)}
            </Text>
            <Text style={styles.cardSub}>
              {m.date} · {m.amount} · {m.fulfil}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { backgroundColor: '#fff', padding: 12, margin: 12, borderRadius: 10 },
  picker: { marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  inputSmall: { flex: 1, backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, marginBottom: 8 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
