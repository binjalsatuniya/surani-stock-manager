import type { HttpClient } from './http';

export function createRecoveryClient(http: HttpClient) {
  return {
    // Whether the master recovery password is set (primary Super Admin only).
    status: () => http.get<{ enabled: boolean }>('/recovery/status'),
    // Set / change / remove the master recovery password. `next: ''` removes it.
    setMasterPassword: (input: { current?: string; next: string }) =>
      http.post<{ enabled: boolean }>('/recovery/master-password', input),
    // PUBLIC — reset a locked-out user's LOGIN password using the master recovery password.
    resetLogin: (input: { username: string; masterPassword: string; newPassword: string }) =>
      http.post<{ ok: true }>('/recovery/reset-login', input),
  };
}
