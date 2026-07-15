import { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { Item, Outward, Party, PayStatus } from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';

export function OutwardScreen() {
  const can = usePermission();
  const canEdit = can('edit_outward');
  const [rows, setRows] = useState<Outward[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transporters, setTransporters] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [gstPct, setGstPct] = useState('0');
  const [payStatus, setPayStatus] = useState<PayStatus>('pending');
  const [creditDays, setCreditDays] = useState('0');
  const [invNo, setInvNo] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [freightRate, setFreightRate] = useState('0');
  const [error, setError] = useState('');

  async function reload() {
    setRows(await api.outward.list());
  }

  useEffect(() => {
    reload();
    api.parties.list('debtor').then(setParties);
    api.items.list().then(setItems);
    api.parties.list('transporter').then(setTransporters);
  }, []);

  async function onAdd() {
    setError('');
    if (!partyId || !itemId || !qty || !rate) return;
    try {
      await api.outward.create({
        date: new Date().toISOString().slice(0, 10),
        partyId,
        itemId,
        qty: Number(qty),
        rate: Number(rate),
        gstPct: Number(gstPct) || 0,
        payStatus,
        creditDays: Number(creditDays) || 0,
        invNo: invNo.trim() || null,
        transporterId: transporterId || null,
        freightRate: Number(freightRate) || 0,
      });
      setQty('');
      setRate('');
      setInvNo('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add outward');
    }
  }

  const partyName = (id: string) => parties.find((p) => p.id === id)?.name || id;
  const itemName = (id: string) => items.find((i) => i.id === id)?.name || id;

  return (
    <View style={styles.container}>
      {canEdit && (
        <ScrollView style={styles.form} contentContainerStyle={{ padding: 12 }}>
          <Text style={styles.label}>Party (debtor)</Text>
          <Picker selectedValue={partyId} onValueChange={setPartyId} style={styles.picker}>
            <Picker.Item label="Select party…" value="" />
            {parties.map((p) => (
              <Picker.Item key={p.id} label={p.name} value={p.id} />
            ))}
          </Picker>
          <Text style={styles.label}>Item</Text>
          <Picker selectedValue={itemId} onValueChange={setItemId} style={styles.picker}>
            <Picker.Item label="Select item…" value="" />
            {items.map((i) => (
              <Picker.Item key={i.id} label={i.name} value={i.id} />
            ))}
          </Picker>
          <View style={styles.row}>
            <TextInput style={styles.inputSmall} placeholder="Qty" keyboardType="numeric" value={qty} onChangeText={setQty} />
            <TextInput style={styles.inputSmall} placeholder="Rate" keyboardType="numeric" value={rate} onChangeText={setRate} />
            <TextInput style={styles.inputSmall} placeholder="GST %" keyboardType="numeric" value={gstPct} onChangeText={setGstPct} />
          </View>
          <Text style={styles.label}>Payment Status</Text>
          <Picker selectedValue={payStatus} onValueChange={(v) => setPayStatus(v as PayStatus)} style={styles.picker}>
            <Picker.Item label="Pending" value="pending" />
            <Picker.Item label="Received" value="received" />
            <Picker.Item label="Credit" value="credit" />
          </Picker>
          <View style={styles.row}>
            <TextInput style={styles.inputSmall} placeholder="Credit Days" keyboardType="numeric" value={creditDays} onChangeText={setCreditDays} />
            <TextInput style={styles.inputSmall} placeholder="Invoice No." value={invNo} onChangeText={setInvNo} />
          </View>
          <Text style={styles.label}>Transporter</Text>
          <Picker selectedValue={transporterId} onValueChange={setTransporterId} style={styles.picker}>
            <Picker.Item label="— none —" value="" />
            {transporters.map((t) => (
              <Picker.Item key={t.id} label={t.name} value={t.id} />
            ))}
          </Picker>
          <TextInput style={styles.input} placeholder="Freight (₹/unit)" keyboardType="numeric" value={freightRate} onChangeText={setFreightRate} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={onAdd}>
            <Text style={styles.buttonText}>Add Outward</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: r }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {partyName(r.partyId)} · {itemName(r.itemId)}
            </Text>
            <Text style={styles.cardSub}>
              {r.date} · Qty {r.qty} · ₹{r.amount} · {r.payStatus}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No outward entries yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { backgroundColor: '#fff', margin: 12, borderRadius: 10, maxHeight: 420 },
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
