import { useEffect, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import type { Role, User } from '@surani/shared';
import { defaultPermsForRole } from '@surani/shared';
import { api } from '../lib/apiClient';

export function UsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [error, setError] = useState('');

  async function reload() {
    setUsers(await api.users.list());
  }

  useEffect(() => {
    reload();
  }, []);

  async function onAdd() {
    setError('');
    if (!name.trim() || !username.trim() || !password) return;
    try {
      await api.users.create({
        name: name.trim(),
        username: username.trim(),
        password,
        role,
        permissions: defaultPermsForRole(role),
      });
      setName('');
      setUsername('');
      setPassword('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add user');
    }
  }

  async function onDelete(id: string) {
    Alert.alert('Delete user', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.users.remove(id);
          reload();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.form} contentContainerStyle={{ padding: 12 }}>
        <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        <Text style={styles.label}>Role</Text>
        <Picker selectedValue={role} onValueChange={(v) => setRole(v as Role)} style={styles.picker}>
          <Picker.Item label="Staff" value="staff" />
          <Picker.Item label="Account" value="account" />
          <Picker.Item label="Admin" value="admin" />
          <Picker.Item label="Superadmin" value="superadmin" />
        </Picker>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={onAdd}>
          <Text style={styles.buttonText}>Add User</Text>
        </TouchableOpacity>
      </ScrollView>
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item: u }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{u.name}</Text>
              <Text style={styles.cardSub}>
                {u.username} · {u.role}
              </Text>
            </View>
            {u.role !== 'superadmin' && (
              <TouchableOpacity onPress={() => onDelete(u.id)}>
                <Text style={styles.delete}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No users yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  form: { backgroundColor: '#fff', margin: 12, borderRadius: 10, maxHeight: 340 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 2, marginTop: 6 },
  picker: { marginBottom: 4 },
  input: { backgroundColor: '#f5f7fb', borderRadius: 8, padding: 10, marginBottom: 8 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' },
  error: { color: '#dc2626', marginBottom: 6 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 14 },
  cardSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  delete: { color: '#dc2626', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
