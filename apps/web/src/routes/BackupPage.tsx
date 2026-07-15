import { useRef, useState } from 'react';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export function BackupPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onExport() {
    const data = await api.backup.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stockmgr-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    </div>
  );
}
