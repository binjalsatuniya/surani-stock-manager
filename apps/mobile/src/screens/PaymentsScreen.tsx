import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { PAYMENT_MODES, type Party, type Payment, type PaymentDirection, type PaymentMode } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function PaymentsScreen() {
  const can = usePermission();
  const canRecord = can('record_payments');
  const [rows, setRows] = useState<Payment[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState('');
  const [dir, setDir] = useState<PaymentDirection>('in');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('Cash');
  const [error, setError] = useState('');

  async function reload() {
    setRows(await api.payments.list());
  }

  useEffect(() => {
    reload();
    api.parties.list('debtor').then(setParties);
  }, []);

  async function onAdd() {
    setError('');
    if (!partyId || !amount) return;
    try {
      await api.payments.create({
        date: new Date().toISOString().slice(0, 10),
        partyId,
        dir,
        amount: Number(amount),
        mode,
      });
      setAmount('');
      setPartyId('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    }
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;

  return (
    <View style={styles.container}>
      {canRecord && (
        <ScrollView style={styles.form} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.label}>Party</Text>
          <Picker selectedValue={partyId} onValueChange={setPartyId} style={styles.picker}>
            <Picker.Item label="Select party…" value="" />
            {parties.map((p) => (
              <Picker.Item key={p.id} label={p.name} value={p.id} />
            ))}
          </Picker>
          <Text style={styles.label}>Direction</Text>
          <Picker selectedValue={dir} onValueChange={(v) => setDir(v as PaymentDirection)} style={styles.picker}>
            <Picker.Item label="Received" value="in" />
            <Picker.Item label="Paid" value="out" />
          </Picker>
          <Text style={styles.label}>Mode</Text>
          <Picker selectedValue={mode} onValueChange={(v) => setMode(v as PaymentMode)} style={styles.picker}>
            {PAYMENT_MODES.map((m) => (
              <Picker.Item key={m} label={m} value={m} />
            ))}
          </Picker>
          <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={onAdd}>
            <Text style={styles.buttonText}>Record Payment</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: p }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{partyName(p.partyId)}</Text>
            <Text style={styles.cardSub}>
              {p.date} · {p.dir === 'in' ? 'Received' : 'Paid'} ₹{p.amount} · {p.mode}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No payments yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { backgroundColor: '#fff', margin: 12, borderRadius: 10, maxHeight: 360 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 2, marginTop: 6 },
  picker: { marginBottom: 4 },
  input: { backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, marginBottom: 8 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#dc2626', marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
