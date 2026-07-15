import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { Item, ItemUnit } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function ItemsScreen() {
  const can = usePermission();
  const canEdit = can('edit_items');
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<ItemUnit>('KG');
  const [rate, setRate] = useState('0');
  const [reorder, setReorder] = useState('0');
  const [error, setError] = useState('');

  async function reload() {
    setItems(await api.items.list());
  }

  useEffect(() => {
    reload();
  }, []);

  async function onAdd() {
    setError('');
    if (!name.trim()) return;
    try {
      await api.items.create({
        name: name.trim(),
        unit,
        rate: Number(rate) || 0,
        reorder: Number(reorder) || 0,
        category: null,
        code: null,
        opening: 0,
        rateDate: null,
      });
      setName('');
      setRate('0');
      setReorder('0');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add item');
    }
  }

  return (
    <View style={styles.container}>
      {canEdit && (
        <ScrollView style={styles.form} contentContainerStyle={{ padding: 12 }}>
          <TextInput style={styles.input} placeholder="Item name" value={name} onChangeText={setName} />
          <Text style={styles.label}>Unit</Text>
          <Picker selectedValue={unit} onValueChange={(v) => setUnit(v as ItemUnit)} style={styles.picker}>
            <Picker.Item label="KG" value="KG" />
            <Picker.Item label="MT" value="MT" />
            <Picker.Item label="pcs" value="pcs" />
          </Picker>
          <View style={styles.row}>
            <TextInput style={styles.inputSmall} placeholder="Rate" keyboardType="numeric" value={rate} onChangeText={setRate} />
            <TextInput style={styles.inputSmall} placeholder="Reorder level" keyboardType="numeric" value={reorder} onChangeText={setReorder} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={onAdd}>
            <Text style={styles.buttonText}>Add Item</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: i }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{i.name}</Text>
            <Text style={styles.cardSub}>
              {i.unit} · Rate ₹{i.rate}
              {i.reorder ? ` · Reorder ${i.reorder}` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No items yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { backgroundColor: '#fff', margin: 12, borderRadius: 10, maxHeight: 320 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 2, marginTop: 6 },
  picker: { marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, marginBottom: 8 },
  inputSmall: { flex: 1, backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, marginBottom: 8 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#dc2626', marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
