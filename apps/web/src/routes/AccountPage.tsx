import { useState } from 'react';
import { roleLabel } from '@surani/shared';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser } from '../lib/quickUnlock';

export function AccountPage() {
  const { user } = useAuth();
  const [pinEnabled, setPinEnabled] = useState(!!user?.security.pinEnabled);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Access Settings — the extra password that gates the Login Locations screen (primary only).
  const [accessEnabled, setAccessEnabled] = useState(!!user?.security.locationAccessEnabled);
  const [accCur, setAccCur] = useState('');
  const [accNext, setAccNext] = useState('');
  const [accMsg, setAccMsg] = useState('');
  const [accErr, setAccErr] = useState('');

  if (!user) return null;

  async function onSaveAccess(remove = false) {
    setAccErr('');
    setAccMsg('');
    if (!remove && accNext.length < 4) {
      setAccErr('Access password must be at least 4 characters.');
      return;
    }
    try {
      const res = await api.loginLocations.setAccess({ current: accCur || undefined, next: remove ? '' : accNext });
      setAccessEnabled(res.enabled);
      setAccCur('');
      setAccNext('');
      setAccMsg(remove ? 'Access password removed.' : 'Access password saved. Login Locations now needs it.');
    } catch (e) {
      setAccErr(e instanceof Error ? e.message : 'Failed to save access password');
    }
  }

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
        <strong>{user.name}</strong> · {user.username} · {roleLabel(user.role)}
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

      {user.isPrimary && (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--line)', borderRadius: 9 }}>
          <div style={{ fontWeight: 600 }}>Access Settings — Login Locations password</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            Set an extra password that must be entered to view Login Locations. Even someone who has your login
            can't see the locations without this password. {accessEnabled ? 'It is currently ON.' : 'It is currently off.'}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {accessEnabled && (
              <input
                type="password"
                placeholder="Current password"
                value={accCur}
                onChange={(e) => setAccCur(e.target.value)}
                style={{ maxWidth: 180, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
              />
            )}
            <input
              type="password"
              placeholder={accessEnabled ? 'New password' : 'Set a password'}
              value={accNext}
              onChange={(e) => setAccNext(e.target.value)}
              style={{ maxWidth: 180, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
            />
            <button className="btn btn-sm btn-primary" onClick={() => onSaveAccess(false)}>
              {accessEnabled ? 'Change password' : 'Set password'}
            </button>
            {accessEnabled && (
              <button className="btn btn-sm btn-danger" onClick={() => onSaveAccess(true)} title="Requires the current password">
                Turn off
              </button>
            )}
          </div>
          {accErr && <div className="login-err show">{accErr}</div>}
          {accMsg && <div className="muted" style={{ marginTop: 8 }}>{accMsg}</div>}
        </div>
      )}
    </div>
  );
}
