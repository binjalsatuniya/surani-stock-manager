import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser } from '../lib/quickUnlock';

export function AccountPage() {
  const { user } = useAuth();
  const [pinEnabled, setPinEnabled] = useState(!!user?.security.pinEnabled);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  if (!user) return null;

  async function onTogglePin(checked: boolean) {
    setError('');
    setMessage('');
    if (!checked) {
      await api.users.setPin(user!.id, null);
      setPinEnabled(false);
      forgetQuickUnlockUser();
      setMessage('PIN login disabled.');
    } else {
      setPinEnabled(true);
    }
  }

  async function onSetPin() {
    setError('');
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4 to 6 digits.');
      return;
    }
    try {
      await api.users.setPin(user!.id, pin);
      rememberQuickUnlockUser(user!.id, user!.username);
      setPin('');
      setMessage('PIN set — you can now use quick unlock on this device.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set PIN');
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>My Account</h2>
      <p>
        <strong>{user.name}</strong> · {user.username} · {user.role}
      </p>

      <div style={{ marginTop: 20, padding: 14, border: '1px solid var(--line)', borderRadius: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Login with a PIN</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Set a 4–6 digit PIN to unlock quickly on this device instead of typing your password. Optional — your
              password still works too.
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flex: 'none' }}>
            <input type="checkbox" checked={pinEnabled} onChange={(e) => onTogglePin(e.target.checked)} />
          </label>
        </div>
        {pinEnabled && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="New 4–6 digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ maxWidth: 170, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8, textAlign: 'center', letterSpacing: '.3em' }}
            />
            <button className="btn btn-sm btn-primary" onClick={onSetPin}>
              Set PIN
            </button>
          </div>
        )}
        {error && <div className="login-err show">{error}</div>}
        {message && <div className="muted" style={{ marginTop: 8 }}>{message}</div>}
      </div>
    </div>
  );
}
