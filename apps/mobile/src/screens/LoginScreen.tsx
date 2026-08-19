import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { getQuickUnlockHint, getSavedCredentials, saveCredentials, clearSavedCredentials } from '../lib/quickUnlock';
import { api } from '../lib/apiClient';
import { getLoginCoordsOrThrow, getLoginCoordsBestEffort, isLocationError, LOCATION_MESSAGE } from '../lib/loginLocation';

export function LoginScreen() {
  const { login, unlockWithBiometric } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [hintUsername, setHintUsername] = useState<string | null>(null);
  // Master-recovery reset form
  const [showForgot, setShowForgot] = useState(false);
  const [rUser, setRUser] = useState('');
  const [rMaster, setRMaster] = useState('');
  const [rNew, setRNew] = useState('');
  const [rMsg, setRMsg] = useState('');
  const [rErr, setRErr] = useState('');
  // Only auto-prompt the fingerprint once per mount, so a cancel doesn't loop straight back into it.
  const autoPrompted = useRef(false);

  useEffect(() => {
    // Pre-fill a saved password (if the user chose to remember it on this device).
    getSavedCredentials().then((c) => {
      if (c) {
        setUsername(c.username);
        setPassword(c.password);
        setRemember(true);
      }
    });
    getQuickUnlockHint().then((h) => {
      setHintUsername(h?.username ?? null);
      if (h && !autoPrompted.current) {
        autoPrompted.current = true;
        onBiometric();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onForgotPassword() {
    setRErr('');
    setRMsg('');
    setShowForgot((v) => !v);
  }

  async function onRecover() {
    setRErr('');
    setRMsg('');
    if (!rUser || !rMaster || rNew.length < 4) {
      setRErr('Enter your username, the master recovery password, and a new password (4+ chars).');
      return;
    }
    try {
      await api.recovery.resetLogin({ username: rUser.trim(), masterPassword: rMaster, newPassword: rNew });
      setRMsg('Password reset. Sign in with your new password.');
      setRMaster('');
      setRNew('');
    } catch (e) {
      setRErr(e instanceof Error ? e.message : 'Could not reset. Check the username and master password.');
    }
  }

  async function onSubmit() {
    setError('');
    setBusy(true);
    try {
      // Location is required to sign in (same as the website) so it's recorded for the Super Admin.
      const coords = await getLoginCoordsOrThrow();
      await login(username, password);
      // Save or clear the password for next time, per the checkbox.
      if (remember) saveCredentials(username, password).catch(() => {});
      else clearSavedCredentials().catch(() => {});
      api.loginLocations.create(coords).catch(() => {}); // best-effort record after a successful login
    } catch (err) {
      setError(isLocationError(err) ? LOCATION_MESSAGE : 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  }

  async function onBiometric() {
    setError('');
    setBusy(true);
    try {
      const ok = await unlockWithBiometric();
      // A plain `false` means the user dismissed the OS prompt themselves — no message needed.
      if (!ok) setError('');
      // Record the location best-effort on a quick unlock — don't block the fingerprint on GPS.
      else getLoginCoordsBestEffort().then((coords) => api.loginLocations.create(coords).catch(() => {}));
    } catch (e) {
      // Real reason (no session stored, session expired, no biometrics enrolled).
      setError(e instanceof Error ? e.message : 'Biometric unlock failed.');
      // If the session is gone the hint was cleared, so stop offering the unlock button.
      const h = await getQuickUnlockHint();
      setHintUsername(h?.username ?? null);
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
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
        // Tag the field so the phone's password manager (Google Password Manager / iCloud Keychain)
        // recognises it and offers to save & autofill the login.
        autoComplete="username"
        textContentType="username"
        importantForAutofill="yes"
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          importantForAutofill="yes"
        />
        <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)}>
          <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.rememberRow} onPress={() => setRemember((r) => !r)} activeOpacity={0.7}>
        <View style={[styles.checkbox, remember && styles.checkboxOn]}>
          {remember ? <Text style={styles.checkboxTick}>✓</Text> : null}
        </View>
        <Text style={styles.rememberText}>Remember password on this device</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={onForgotPassword} style={{ alignSelf: 'center', marginTop: 12 }}>
        <Text style={styles.forgot}>Forgot password?</Text>
      </TouchableOpacity>

      {showForgot && (
        <View style={styles.recoverBox}>
          <Text style={styles.recoverHint}>
            Reset your login using the Master Recovery Password (set by the main Super Admin). Passwords can't be
            shown — only reset.
          </Text>
          <TextInput style={styles.recoverInput} placeholder="Your username" placeholderTextColor="#94a3b8" autoCapitalize="none" value={rUser} onChangeText={setRUser} />
          <TextInput style={styles.recoverInput} placeholder="Master recovery password" placeholderTextColor="#94a3b8" secureTextEntry value={rMaster} onChangeText={setRMaster} />
          <TextInput style={styles.recoverInput} placeholder="New password" placeholderTextColor="#94a3b8" secureTextEntry value={rNew} onChangeText={setRNew} />
          <TouchableOpacity style={styles.recoverBtn} onPress={onRecover}>
            <Text style={styles.buttonText}>Reset my password</Text>
          </TouchableOpacity>
          {rErr ? <Text style={styles.error}>{rErr}</Text> : null}
          {rMsg ? <Text style={styles.recoverOk}>{rMsg}</Text> : null}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.hint}>
        First time? Use <Text style={styles.bold}>admin</Text> / <Text style={styles.bold}>admin</Text>.
      </Text>
      <Text style={styles.hint}>📍 Location must be on and allowed to sign in.</Text>
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
    color: '#0b1220',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0b1220',
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  eyeText: { fontSize: 18 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: 4, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: '#5eead4', alignItems: 'center', justifyContent: 'center', marginRight: 10, backgroundColor: 'transparent' },
  checkboxOn: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rememberText: { color: '#e2e8f0', fontSize: 13.5 },
  button: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  biometricButton: { backgroundColor: '#0f766e', marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: '#fecaca', marginTop: 10, textAlign: 'center' },
  hint: { color: '#99f6e4', fontSize: 12, textAlign: 'center', marginTop: 18 },
  forgot: { color: '#99f6e4', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  recoverBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginTop: 12 },
  recoverHint: { color: '#cbd5e1', fontSize: 11.5, marginBottom: 8 },
  recoverInput: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, color: '#0b1220' },
  recoverBtn: { backgroundColor: '#0d9488', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  recoverOk: { color: '#5eead4', fontSize: 12.5, marginTop: 8, textAlign: 'center' },
  bold: { fontWeight: '700' },
});
