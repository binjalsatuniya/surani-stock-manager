import { useEffect, useState } from 'react';
import type { ApprovalRequestDTO } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export function ApprovalsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ApprovalRequestDTO[]>([]);

  async function reload() {
    setRows(await api.approvals.list());
  }

  useEffect(() => {
    reload();
  }, []);

  const [error, setError] = useState('');

  async function onApprove(r: ApprovalRequestDTO) {
    setError('');
    try {
      if (r.kind === 'reset') {
        // Resets are password-gated and only JAYNIL (primary) may approve them.
        const password = window.prompt('Enter the RESET password to approve wiping ALL data. A backup will download first.');
        if (!password) return;
        const res = await api.reset.approve(r.id, password);
        const blob = new Blob([JSON.stringify(res.backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stockmgr-BEFORE-RESET-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Reset approved and completed. A backup was downloaded — keep it safe.');
      } else {
        await api.approvals.approve(r.id);
      }
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    }
  }
  async function onReject(id: string) {
    setError('');
    try {
      await api.approvals.reject(id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    }
  }

  const isSuperadmin = user?.role === 'superadmin';

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Approval Requests</h2>
      {error && <div className="login-err show">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>Requested</th>
            <th>By</th>
            <th>Kind</th>
            <th>Label</th>
            <th>Status</th>
            {isSuperadmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.requestedAt).toLocaleString()}</td>
              <td>{r.requestedBy}</td>
              <td>
                {r.kind} · {r.target}
              </td>
              <td>{r.label}</td>
              <td>{r.status}</td>
              {isSuperadmin && (
                <td>
                  {r.status === 'pending' && (
                    <>
                      {/* A reset can only be approved by JAYNIL (primary) with the reset password. */}
                      {(r.kind !== 'reset' || user?.isPrimary) && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => onApprove(r)}>
                            {r.kind === 'reset' ? 'Approve reset' : 'Approve'}
                          </button>{' '}
                        </>
                      )}
                      <button className="btn btn-sm btn-danger" onClick={() => onReject(r.id)}>
                        Reject
                      </button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No approval requests yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
