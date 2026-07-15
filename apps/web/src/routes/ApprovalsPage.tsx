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

  async function onApprove(id: string) {
    await api.approvals.approve(id);
    reload();
  }
  async function onReject(id: string) {
    await api.approvals.reject(id);
    reload();
  }

  const isSuperadmin = user?.role === 'superadmin';

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Approval Requests</h2>
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
                      <button className="btn btn-sm btn-primary" onClick={() => onApprove(r.id)}>
                        Approve
                      </button>{' '}
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
