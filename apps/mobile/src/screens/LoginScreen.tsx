import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getQuickUnlockHint } from '../lib/quickUnlock';

export function LoginScreen() {
  const { login, unlockWithBiometric } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hintUsername, setHintUsername] = useState<string | null>(null);

  useEffect(() => {
    getQuickUnlockHint().then((h) => setHintUsername(h?.username ?? null));
  }, []);

  async function onSubmit() {
    setError('');
    setBusy(true);
    try {
      await login(username, password);
    } catch {
      setError('Invalid username or password.');
    } finally {
      setBusy(false);
    }
  }

  async function onBiometric() {
    setError('');
    setBusy(true);
    try {
      const ok = await unlockWithBiometric();
      if (!ok) setError('Biometric unlock failed or was cancelled.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Surani and Sons</Text>
      <Text style={styles.subtitle}>STOCK MANAGER · INVENTORY · PARTIES · PAYMENTS</Text>

      {hintUsername && (
        <TouchableOpacity style={[styles.button, styles.biometricButton]} onPress={onBiometric} disabled={busy}>
          <Text style={styles.buttonText}>🔒 Unlock as {hintUsername}</Text>
        </TouchableOpacity>
      )}

      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        First time? Use <Text style={styles.bold}>admin</Text> / <Text style={styles.bold}>admin</Text>.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#134e4a' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 11, color: '#99f6e4', textAlign: 'center', marginTop: 4, marginBottom: 24 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
  },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  biometricButton: { backgroundColor: '#0f766e', marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#fecaca', marginTop: 10, textAlign: 'center' },
  hint: { color: '#99f6e4', fontSize: 12, textAlign: 'center', marginTop: 18 },
  bold: { fontWeight: '700' },
});
