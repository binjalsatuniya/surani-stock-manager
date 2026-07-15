import { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser, biometricAvailable } from '../lib/quickUnlock';

export function AccountScreen() {
  const { user, logout } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(!!user?.security.biometricEnabled);
  const [message, setMessage] = useState('');

  if (!user) return null;

  async function onToggle(checked: boolean) {
    setMessage('');
    if (checked) {
      const available = await biometricAvailable();
      if (!available) {
        setMessage('No biometric hardware enrolled on this device.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable biometric login' });
      if (!result.success) return;
      await api.users.setBiometric(user!.id, true);
      await rememberQuickUnlockUser(user!.id, user!.username);
      setBiometricEnabled(true);
      setMessage('Biometric login enabled — you can now unlock with Face ID / fingerprint.');
    } else {
      await api.users.setBiometric(user!.id, false);
      await forgetQuickUnlockUser();
      setBiometricEnabled(false);
      setMessage('Biometric login disabled.');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.sub}>
        {user.username} · {user.role}
      </Text>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Login with biometrics</Text>
            <Text style={styles.desc}>Use Face ID / fingerprint to sign in instead of typing your password.</Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={onToggle} />
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8', padding: 20 },
  name: { fontSize: 20, fontWeight: '700' },
  sub: { color: '#64748b', marginTop: 4, marginBottom: 20 },
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontWeight: '600', fontSize: 14 },
  desc: { color: '#64748b', fontSize: 11.5, marginTop: 2 },
  message: { marginTop: 10, color: '#0f766e', fontSize: 12.5 },
  logoutButton: { marginTop: 24, backgroundColor: '#fef2f2', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logoutText: { color: '#ef4444', fontWeight: '700' },
});
