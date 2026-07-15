import { useState, type FormEvent } from 'react';
import { ApiError } from '@surani/shared';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/apiClient';
import { getQuickUnlockHint, forgetQuickUnlockUser } from '../lib/quickUnlock';
import { SuraniLockup } from '../components/Logo';

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Too many sign-in attempts. Please wait a few minutes and try again.';
    return 'Invalid username or password.';
  }
  return "Can't reach the server. Make sure 'Start Stock Manager.bat' is running, then try again.";
}

interface Coords {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

// Location is MANDATORY. Reject (blocking login) if unsupported, denied, or unavailable.
function getLocationOrThrow(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('LOCATION_UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'LOCATION_DENIED' : 'LOCATION_UNAVAILABLE')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function isLocationError(err: unknown): err is Error {
  return err instanceof Error && err.message.startsWith('LOCATION_');
}

// Running inside the packaged desktop (Electron) app? There, geolocation may be unavailable, so we
// don't hard-block — we let the user in and record "location unavailable" instead.
function isDesktopApp(): boolean {
  return /electron/i.test(navigator.userAgent);
}

const NO_COORDS: Coords = { latitude: null, longitude: null, accuracy: null };

// Get location. On the website a failure throws (hard block). In the desktop app, geolocation
// needs a Google API key to work — without it, getCurrentPosition just hangs — so we don't wait on
// it: the user signs in immediately and the location is recorded as "unavailable".
async function resolveLoginCoords(): Promise<Coords> {
  if (isDesktopApp()) {
    try {
      // Give it a brief chance (in case a key IS configured), but never hang the login.
      return await Promise.race([
        getLocationOrThrow(),
        new Promise<Coords>((resolve) => setTimeout(() => resolve(NO_COORDS), 4000)),
      ]);
    } catch {
      return NO_COORDS;
    }
  }
  return getLocationOrThrow();
}

const LOCATION_MESSAGE =
  'Location is required to sign in. Please turn on location/GPS and allow this app to access your location, then try again.';

export function LoginPage() {
  const { login, loginWithPin } = useAuth();
  const hint = getQuickUnlockHint();
  const [quickUnlock, setQuickUnlock] = useState(!!hint);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const coords = await resolveLoginCoords(); // mandatory on web (blocks); desktop falls back
      await login(username, password);
      api.loginLocations.create(coords).catch(() => {}); // record for the Super Admin (best-effort)
    } catch (err) {
      setError(isLocationError(err) ? LOCATION_MESSAGE : loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPinSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const coords = await resolveLoginCoords(); // mandatory on web (blocks); desktop falls back
      await loginWithPin(hint!.userId, pin);
      api.loginLocations.create(coords).catch(() => {});
    } catch (err) {
      if (isLocationError(err)) {
        setError(LOCATION_MESSAGE);
      } else {
        setError('Incorrect PIN.');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  }

  if (quickUnlock && hint) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Surani and Sons</h1>
          <div className="sub">Welcome back, {hint.username}</div>
          <form onSubmit={onPinSubmit}>
            <div className="field">
              <label>Enter your PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={{ textAlign: 'center', letterSpacing: '.4em', fontSize: 22, fontWeight: 700 }}
              />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </button>
            <div className={`login-err${error ? ' show' : ''}`}>{error}</div>
          </form>
          <div className="muted" style={{ marginTop: 14 }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                forgetQuickUnlockUser();
                setQuickUnlock(false);
              }}
              style={{ color: 'var(--accent-2)', fontWeight: 600, textDecoration: 'underline' }}
            >
              Use username &amp; password instead
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div style={{ marginBottom: 22 }}>
          <SuraniLockup />
        </div>
        <div className="sub" style={{ textAlign: 'center' }}>STOCK MANAGER &middot; INVENTORY &middot; PARTIES &middot; PAYMENTS</div>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className={`login-err${error ? ' show' : ''}`}>{error}</div>
        </form>
        {hint && (
          <div className="login-hint" style={{ marginTop: 14 }}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setQuickUnlock(true);
              }}
              style={{ color: 'var(--accent-2)', fontWeight: 600, textDecoration: 'underline' }}
            >
              🔒 Use quick unlock instead
            </a>
          </div>
        )}
        <div className="muted" style={{ marginTop: 14 }}>
          First time? Use <strong>admin</strong> / <strong>admin</strong>.
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: 11.5 }}>
          📍 Location must be enabled and allowed to sign in.
        </div>
      </div>
    </div>
  );
}
