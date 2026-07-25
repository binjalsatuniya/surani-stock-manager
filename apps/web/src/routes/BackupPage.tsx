import { useRef, useState } from 'react';
import { RESET_SCOPES } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

function downloadJson(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function BackupPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Danger Zone (reset selected data)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';
  const [resetPw, setResetPw] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetErr, setResetErr] = useState('');
  // Which categories to wipe — all ticked by default (= full reset).
  const [scopes, setScopes] = useState<Set<string>>(new Set(RESET_SCOPES.map((s) => s.key)));
  const toggleScope = (key: string) =>
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function onExport() {
    const data = await api.backup.export();
    downloadJson(data, `stockmgr-backup-${new Date().toISOString().slice(0, 10)}.json`);
  }

  const selectedLabels = () => RESET_SCOPES.filter((s) => scopes.has(s.key)).map((s) => s.label).join('; ');

  async function onReset() {
    setResetErr('');
    setResetMsg('');
    if (!resetPw) return setResetErr('Enter the reset password.');
    if (scopes.size === 0) return setResetErr('Tick at least one type of data to reset.');
    if (!confirm(`This DELETES the selected data:\n\n${selectedLabels()}\n\nYour login stays. A full backup downloads first. Continue?`)) return;
    if (!confirm('Are you absolutely sure? This cannot be undone except by restoring the backup file.')) return;
    setBusy(true);
    try {
      const res = await api.reset.execute(resetPw, [...scopes]);
      downloadJson(res.backup, `stockmgr-BEFORE-RESET-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
      setResetPw('');
      alert('The selected data has been reset. A backup was downloaded — keep it safe. The page will reload.');
      window.location.reload();
    } catch (err) {
      setResetErr(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  async function onRequestReset() {
    setResetErr('');
    setResetMsg('');
    if (scopes.size === 0) return setResetErr('Tick at least one type of data to reset.');
    if (!confirm(`Send a request to reset the selected data?\n\n${selectedLabels()}\n\nJAYNIL must approve it before anything is deleted.`)) return;
    setBusy(true);
    try {
      await api.reset.request([...scopes]);
      setResetMsg('Reset request sent. It will appear in Approvals for JAYNIL to approve.');
    } catch (err) {
      setResetErr(err instanceof Error ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  }

  function onImportClick() {
    fileInputRef.current?.click();
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!confirm('This will REPLACE all current data with this backup. Proceed?')) return;
      setBusy(true);
      await api.backup.import(data);
      alert('Data restored successfully. The page will now reload.');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Backup &amp; Restore</h2>
      <p className="muted">Download a full backup of all data, or restore from a previously downloaded backup file.</p>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={onExport}>
          Download Backup
        </button>
        {user?.role === 'superadmin' && (
          <button className="btn" onClick={onImportClick} disabled={busy}>
            {busy ? 'Restoring…' : 'Restore from file…'}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onFileChosen} />
      </div>
      {error && <div className="login-err show">{error}</div>}

      {isAdmin && (
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '2px solid #fecaca' }}>
          <h3 style={{ margin: '0 0 4px', color: '#b91c1c' }}>⚠️ Danger Zone — Reset data</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Tick exactly which data to permanently delete. User logins and app settings are always kept. A
            full backup downloads automatically first, so you can restore it above if this was a mistake.
          </p>
          <div style={{ display: 'grid', gap: 6, margin: '10px 0 14px' }}>
            {RESET_SCOPES.map((s) => (
              <label key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={scopes.has(s.key)} onChange={() => toggleScope(s.key)} />
                {s.label}
              </label>
            ))}
          </div>

          {user?.isPrimary ? (
            <div className="toolbar" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Reset password</label>
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="Set this in My Account → Access Settings"
                  style={{ minWidth: 240 }}
                />
              </div>
              <button className="btn btn-danger" onClick={onReset} disabled={busy}>
                {busy ? 'Resetting…' : 'Reset all data'}
              </button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={onRequestReset} disabled={busy}>
              {busy ? 'Sending…' : 'Request data reset (needs JAYNIL approval)'}
            </button>
          )}
          {resetMsg && <div style={{ color: '#0f766e', marginTop: 10, fontSize: 13 }}>{resetMsg}</div>}
          {resetErr && <div className="login-err show">{resetErr}</div>}
        </div>
      )}
    </div>
  );
}
