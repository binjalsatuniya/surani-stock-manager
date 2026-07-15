import { useEffect, useState } from 'react';
import type { AuditLogEntry } from '@surani/shared';
import { api } from '../lib/apiClient';

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    api.auditLog.list().then(setRows);
  }, []);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Audit Log</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>Target</th>
            <th>Label</th>
            <th>Actor</th>
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
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No edits or deletes recorded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
