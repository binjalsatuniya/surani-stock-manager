import { useEffect, useState } from 'react';
import type { AuditLogEntry } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export function AuditLogPage() {
  const { user } = useAuth();
  const canReverse = user?.role === 'superadmin' || user?.role === 'admin';
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState('');

  function load() {
    api.auditLog.list().then(setRows).catch(() => {});
  }
  useEffect(() => {
    load();
  }, []);

  async function onReverse(id: string) {
    if (!confirm('Reverse this entry — restore it to exactly how it was before this change?')) return;
    setError('');
    try {
      await api.auditLog.reverse(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reverse this entry');
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>
        Audit Log <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— every edit &amp; delete, reversible</span>
      </h2>
      {error && <div className="login-err show">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Target</th>
            <th>Label</th>
            <th>Actor</th>
            {canReverse && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.timestamp).toLocaleString()}</td>
              <td>{r.action}</td>
              <td>{r.target}</td>
              <td>{r.label}</td>
              <td>{r.actorName}</td>
              {canReverse && (
                <td>
                  {r.reversible ? (
                    <button className="btn btn-sm btn-danger" onClick={() => onReverse(r.id)} title="Undo this change">
                      Reverse
                    </button>
                  ) : r.reversed ? (
                    <span className="muted" style={{ fontSize: 11 }}>reversed</span>
                  ) : null}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={canReverse ? 6 : 5} className="muted">
                No edits or deletes recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
