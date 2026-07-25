import type { HttpClient } from './http';

// A full backup snapshot returned right before a reset wipes the data (so it can be re-downloaded).
export interface ResetBackup {
  version: number;
  exportedAt: string;
  db: Record<string, unknown[]>;
}

export function createResetClient(http: HttpClient) {
  return {
    // Whether the dedicated reset password is set (primary Super Admin only).
    status: () => http.get<{ enabled: boolean }>('/reset/status'),
    // Set / change / remove the reset password. `next: ''` removes it.
    setPassword: (input: { current?: string; next: string }) =>
      http.post<{ enabled: boolean }>('/reset/password', input),
    // JAYNIL wipes directly (returns the pre-wipe backup to download).
    execute: (password: string) => http.post<{ ok: true; backup: ResetBackup }>('/reset/execute', { password }),
    // A non-primary admin queues a reset for JAYNIL's approval.
    request: () => http.post<{ queued: true }>('/reset/request', {}),
    // JAYNIL approves a queued reset (returns the pre-wipe backup to download).
    approve: (id: string, password: string) =>
      http.post<{ ok: true; backup: ResetBackup }>(`/reset/approve/${id}`, { password }),
  };
}
