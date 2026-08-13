import { useEffect, useState } from 'react';
import { roleLabel } from '@surani/shared';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { NAV_DEFS } from '../components/Layout';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser } from '../lib/quickUnlock';

export function AccountPage() {
  const { user, updateUser, llUnlocked, unlockLoginLocations } = useAuth();
  const can = usePermission();

  // Sidebar entries this user has tidied away. Saved to the account, so it follows them to any
  // device rather than living in one browser.
  const menuHidden = user?.preferences?.menuHidden ?? [];

  async function saveMenuHidden(next: string[]) {
    if (!user) return;
    try {
      updateUser(await api.users.setPreferences(user.id, { menuHidden: next }));
    } catch {
      /* leave the menu as it is if the save fails */
    }
  }
  function toggleMenuItem(key: string) {
    saveMenuHidden(menuHidden.includes(key) ? menuHidden.filter((k) => k !== key) : [...menuHidden, key]);
  }
  // Change my own login (username + password)
  const [myCur, setMyCur] = useState('');
  const [myUser, setMyUser] = useState('');
  const [myPass, setMyPass] = useState('');
  const [myMsg, setMyMsg] = useState('');
  const [myErr, setMyErr] = useState('');

  async function onSaveMyLogin() {
    setMyErr('');
    setMyMsg('');
    if (!myCur) return setMyErr('Enter your current password.');
    if (!myUser.trim() && !myPass) return setMyErr('Enter a new username and/or a new password.');
    if (myPass && myPass.length < 4) return setMyErr('New password must be at least 4 characters.');
    try {
      const updated = await api.users.updateMyLogin({
        currentPassword: myCur,
        username: myUser.trim() || undefined,
        password: myPass || undefined,
      });
      updateUser(updated);
      setMyCur('');
      setMyPass('');
      setMyUser('');
      setMyMsg('Your login was updated. Use it next time you sign in.');
    } catch (e) {
      setMyErr(e instanceof Error ? e.message : 'Could not update your login');
    }
  }
  const [llPw, setLlPw] = useState('');
  const [llMsg, setLlMsg] = useState('');
  const [llErr, setLlErr] = useState('');

  async function onUnlockLL() {
    setLlErr('');
    setLlMsg('');
    try {
      await unlockLoginLocations(llPw);
      setLlPw('');
      setLlMsg('Unlocked — “Login Locations” now appears in the menu for this session.');
    } catch (e) {
      setLlErr(e instanceof Error ? e.message : 'Incorrect access password');
    }
  }
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

  // Reset password — the dedicated password that authorises wiping ALL data (primary only).
  const [resetEnabled, setResetEnabled] = useState(false);
  const [rstCur, setRstCur] = useState('');
  const [rstNext, setRstNext] = useState('');
  const [rstMsg, setRstMsg] = useState('');
  const [rstErr, setRstErr] = useState('');

  // Master Recovery password — can reset any user's LOGIN password (primary only).
  const [masterEnabled, setMasterEnabled] = useState(false);
  const [mstCur, setMstCur] = useState('');
  const [mstNext, setMstNext] = useState('');
  const [mstMsg, setMstMsg] = useState('');
  const [mstErr, setMstErr] = useState('');

  useEffect(() => {
    if (user?.isPrimary) {
      api.reset.status().then((s) => setResetEnabled(s.enabled)).catch(() => {});
      api.recovery.status().then((s) => setMasterEnabled(s.enabled)).catch(() => {});
    }
  }, [user?.isPrimary]);

  async function onSaveMaster(remove = false) {
    setMstErr('');
    setMstMsg('');
    if (!remove && mstNext.length < 10) {
      setMstErr('Master password must be at least 10 characters.');
      return;
    }
    try {
      const res = await api.recovery.setMasterPassword({ current: mstCur || undefined, next: remove ? '' : mstNext });
      setMasterEnabled(res.enabled);
      setMstCur('');
      setMstNext('');
      setMstMsg(remove ? 'Master recovery password removed.' : 'Master recovery password saved. Keep it somewhere very safe.');
    } catch (e) {
      setMstErr(e instanceof Error ? e.message : 'Failed to save master password');
    }
  }

  async function onSaveReset(remove = false) {
    setRstErr('');
    setRstMsg('');
    if (!remove && rstNext.length < 6) {
      setRstErr('Reset password must be at least 6 characters.');
      return;
    }
    try {
      const res = await api.reset.setPassword({ current: rstCur || undefined, next: remove ? '' : rstNext });
      setResetEnabled(res.enabled);
      setRstCur('');
      setRstNext('');
      setRstMsg(remove ? 'Reset password removed.' : 'Reset password saved. It is needed to wipe all data.');
    } catch (e) {
      setRstErr(e instanceof Error ? e.message : 'Failed to save reset password');
    }
  }

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

      {/* Tidy the sidebar. Useful mainly for the Super Admin, who is shown every page whether or
          not it is part of daily work — Role Master, PDF Layout, Backup and so on. */}
      <div style={{ marginTop: 8, padding: 14, border: '1px solid var(--line)', borderRadius: 9 }}>
        <div style={{ fontWeight: 600 }}>Menu items</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          Untick anything you don’t use day to day and it disappears from your sidebar. This only
          affects your own menu — it changes nobody else, and it doesn’t remove your access: an
          unticked page still opens if you go to it directly.
        </div>
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '2px 14px',
          }}
        >
          {NAV_DEFS.filter((d) => (!d.perm || can(d.perm)) && (!d.primaryOnly || user.isPrimary)).map((d) => (
            <label key={d.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
              <input type="checkbox" checked={!menuHidden.includes(d.key)} onChange={() => toggleMenuItem(d.key)} />
              {d.label}
            </label>
          ))}
        </div>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" onClick={() => saveMenuHidden([])} disabled={menuHidden.length === 0}>
            Show all again
          </button>
          <span className="muted" style={{ fontSize: 11.5 }}>
            {menuHidden.length === 0 ? 'Nothing hidden.' : `${menuHidden.length} hidden.`}
          </span>
        </div>
      </div>

      {/* Everyone can change their OWN username & password. */}
      <div style={{ marginTop: 8, padding: 14, border: '1px solid var(--line)', borderRadius: 9 }}>
        <div style={{ fontWeight: 600 }}>Change my login (username &amp; password)</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
          Update your own username or password. Enter your current password to confirm. Leave a field blank to keep it.
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="password"
            placeholder="Current password"
            value={myCur}
            onChange={(e) => setMyCur(e.target.value)}
            style={{ maxWidth: 190, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <input
            placeholder={`New username (now: ${user.username})`}
            value={myUser}
            onChange={(e) => setMyUser(e.target.value)}
            style={{ maxWidth: 210, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <input
            type="password"
            placeholder="New password"
            value={myPass}
            onChange={(e) => setMyPass(e.target.value)}
            style={{ maxWidth: 170, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <button className="btn btn-sm btn-primary" onClick={onSaveMyLogin}>Save</button>
        </div>
        {myErr && <div className="login-err show">{myErr}</div>}
        {myMsg && <div className="muted" style={{ marginTop: 8, color: '#0f766e' }}>{myMsg}</div>}
      </div>

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

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Show Login Locations in the menu</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              Login Locations is hidden from the menu. Enter the access password here to reveal it for this
              session. {llUnlocked ? 'It is currently visible.' : 'It is currently hidden.'}
            </div>
            {!llUnlocked && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="password"
                  placeholder="Access password"
                  value={llPw}
                  onChange={(e) => setLlPw(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onUnlockLL()}
                  style={{ maxWidth: 200, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
                />
                <button className="btn btn-sm btn-primary" onClick={onUnlockLL}>Show in menu</button>
              </div>
            )}
            {llErr && <div className="login-err show">{llErr}</div>}
            {llMsg && <div className="muted" style={{ marginTop: 8, color: '#0f766e' }}>{llMsg}</div>}
          </div>
        </div>
      )}

      {user.isPrimary && (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid #fecaca', borderRadius: 9 }}>
          <div style={{ fontWeight: 600, color: '#b91c1c' }}>Reset password — authorises wiping ALL data</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            A separate password required to reset all business data (in Backup → Danger Zone) and to
            approve a reset another admin requests. {resetEnabled ? 'It is currently set.' : 'It is not set yet.'}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {resetEnabled && (
              <input
                type="password"
                placeholder="Current reset password"
                value={rstCur}
                onChange={(e) => setRstCur(e.target.value)}
                style={{ maxWidth: 200, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
              />
            )}
            <input
              type="password"
              placeholder={resetEnabled ? 'New reset password' : 'Set a reset password'}
              value={rstNext}
              onChange={(e) => setRstNext(e.target.value)}
              style={{ maxWidth: 200, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
            />
            <button className="btn btn-sm btn-primary" onClick={() => onSaveReset(false)}>
              {resetEnabled ? 'Change password' : 'Set password'}
            </button>
            {resetEnabled && (
              <button className="btn btn-sm btn-danger" onClick={() => onSaveReset(true)} title="Requires the current reset password">
                Turn off
              </button>
            )}
          </div>
          {rstErr && <div className="login-err show">{rstErr}</div>}
          {rstMsg && <div className="muted" style={{ marginTop: 8 }}>{rstMsg}</div>}
        </div>
      )}

      {user.isPrimary && (
        <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--line)', borderRadius: 9 }}>
          <div style={{ fontWeight: 600 }}>Master Recovery Password — reset any forgotten login</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
            If anyone (including you) forgets their login password, they can reset it from the login screen's
            “Forgot password?” using this master password. Store it somewhere very safe — it is the key to
            every account. It canNOT wipe data. Currently {masterEnabled ? 'set.' : 'not set.'}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {masterEnabled && (
              <input
                type="password"
                placeholder="Current master password"
                value={mstCur}
                onChange={(e) => setMstCur(e.target.value)}
                style={{ maxWidth: 210, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
              />
            )}
            <input
              type="password"
              placeholder={masterEnabled ? 'New master password' : 'Set a master password (10+ chars)'}
              value={mstNext}
              onChange={(e) => setMstNext(e.target.value)}
              style={{ maxWidth: 230, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
            />
            <button className="btn btn-sm btn-primary" onClick={() => onSaveMaster(false)}>
              {masterEnabled ? 'Change password' : 'Set password'}
            </button>
            {masterEnabled && (
              <button className="btn btn-sm btn-danger" onClick={() => onSaveMaster(true)} title="Requires the current master password">
                Turn off
              </button>
            )}
          </div>
          {mstErr && <div className="login-err show">{mstErr}</div>}
          {mstMsg && <div className="muted" style={{ marginTop: 8 }}>{mstMsg}</div>}
        </div>
      )}
    </div>
  );
}
