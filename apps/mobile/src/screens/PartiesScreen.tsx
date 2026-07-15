import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Party } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function PartiesScreen() {
  const can = usePermission();
  const [parties, setParties] = useState<Party[]>([]);
  const [name, setName] = useState('');

  async function reload() {
    setParties(await api.parties.list());
  }

  useEffect(() => {
    reload();
  }, []);

  async function onAdd() {
    if (!name.trim()) return;
    await api.parties.create({
      name: name.trim(),
      type: 'debtor',
      salesPersonId: null,
      phone: null,
      email: null,
      gst: null,
      opening: 0,
      creditDays: 0,
      defaultFreight: 0,
      address: null,
      locationUrl: null,
      vehicle: null,
    });
    setName('');
    reload();
  }

  return (
    <View style={styles.container}>
      {can('edit_parties') && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="New party name" value={name} onChangeText={setName} />
          <TouchableOpacity style={styles.button} onPress={onAdd}>
            <Text style={styles.buttonText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={parties}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: p }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{p.name}</Text>
            <Text style={styles.cardSub}>
              {p.type} {p.phone ? `· ${p.phone}` : ''}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No parties yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', margin: 12, borderRadius: 10 },
  input: { flex: 1, backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
