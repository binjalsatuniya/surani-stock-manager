import type { HttpClient } from './http';

export function createPushClient(http: HttpClient) {
  return {
    // Register (or refresh) this device's push token for the signed-in user.
    register: (token: string, platform?: 'android' | 'ios') =>
      http.post<{ ok: true }>('/push/register', { token, platform }),
    // Drop this device's token (called on full sign-out).
    unregister: (token: string) => http.post<{ ok: true }>('/push/unregister', { token }),
  };
}
