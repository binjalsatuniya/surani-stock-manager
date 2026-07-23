import { useEffect, useState } from 'react';
import type { LoginLocation } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function LoginLocationsPage() {
  const { user } = useAuth();
  const isPrimary = !!user?.isPrimary;
  const [rows, setRows] = useState<LoginLocation[]>([]);
  const [error, setError] = useState('');
  // Gate state: locked until the access password (if set) is entered.
  const [needPassword, setNeedPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!isPrimary) return;
    api.loginLocations
      .accessStatus()
      .then((s) => {
        if (s.enabled) {
          setNeedPassword(true); // wait for the password before loading anything
        } else {
          setUnlocked(true);
          api.loginLocations.list().then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load login locations'));
  }, [isPrimary]);

  async function onUnlock() {
    setError('');
    try {
      const data = await api.loginLocations.view(password);
      setRows(data);
      setUnlocked(true);
      setNeedPassword(false);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Incorrect access password');
    }
  }

  if (!isPrimary) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Login Locations</h2>
        <div className="muted">Only the main Super Admin can view login locations.</div>
      </div>
    );
  }

  if (needPassword && !unlocked) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Login Locations</h2>
        <p className="muted">This is protected. Enter your access password to view login locations.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 360 }}>
          <input
            type="password"
            autoFocus
            placeholder="Access password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
            style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 8 }}
          />
          <button className="btn btn-primary" onClick={onUnlock}>Unlock</button>
        </div>
        {error && <div className="login-err show">{error}</div>}
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          Set or change this password in My Account → Access Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>
        Login Locations <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— where each user signed in from</span>
      </h2>
      {error && <div className="login-err show">{error}</div>}
      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Date &amp; Time</th>
            <th>User</th>
            <th>Accuracy</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hasCoords = r.latitude != null && r.longitude != null;
            const mapsUrl = hasCoords ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}` : null;
            return (
              <tr key={r.id}>
                <td>{fmtDateTime(r.createdAt)}</td>
                <td>
                  <strong>{r.userName || r.username}</strong>
                  {r.userName && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>@{r.username}</span>}
                </td>
                <td>{r.accuracy != null ? `±${Math.round(r.accuracy)} m` : '—'}</td>
                <td>
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>
                      📍 View on Map
                    </a>
                  ) : (
                    <span className="muted">Location unavailable</span>
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No login locations recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
