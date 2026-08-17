import type { HttpClient } from './http';

// A full backup snapshot returned right before a reset wipes the data (so it can be re-downloaded).
export interface ResetBackup {
  version: number;
  exportedAt: string;
  db: Record<string, unknown[]>;
}

// The selectable categories a reset can wipe, with friendly labels (order = display order).
export const RESET_SCOPES: { key: string; label: string }[] = [
  { key: 'sales', label: 'Sales (outward invoices, receipts, freight/handling on sales)' },
  { key: 'purchases', label: 'Purchases (inward invoices, payments, freight/handling on purchases)' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'parties', label: 'Parties (needs Sales & Purchases too)' },
  { key: 'items', label: 'Items (needs Sales & Purchases too)' },
  { key: 'salesPersons', label: 'Sales Persons (needs Parties + Expenses too)' },
  { key: 'loginLocations', label: 'Login-location history' },
  { key: 'auditLog', label: 'Audit log' },
  { key: 'approvals', label: 'Approval requests' },
  { key: 'financialYears', label: 'Financial years' },
];

export function createResetClient(http: HttpClient) {
  return {
    // Whether the dedicated reset password is set (primary Super Admin only).
    status: () => http.get<{ enabled: boolean }>('/reset/status'),
    // Set / change / remove the reset password. `next: ''` removes it.
    setPassword: (input: { current?: string; next: string }) =>
      http.post<{ enabled: boolean }>('/reset/password', input),
    // JAYNIL wipes the selected data directly (returns the pre-wipe backup to download).
    execute: (password: string, scopes?: string[]) =>
      http.post<{ ok: true; backup: ResetBackup }>('/reset/execute', { password, scopes }),
    // A non-primary admin queues a reset (of the selected data) for JAYNIL's approval.
    request: (scopes?: string[]) => http.post<{ queued: true }>('/reset/request', { scopes }),
    // JAYNIL approves a queued reset (returns the pre-wipe backup to download).
    approve: (id: string, password: string) =>
      http.post<{ ok: true; backup: ResetBackup }>(`/reset/approve/${id}`, { password }),
  };
}
