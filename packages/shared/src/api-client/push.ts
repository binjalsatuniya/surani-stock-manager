import type { HttpClient } from './http';
import type { NotifyActivityKey } from '../notifications';

/** A recent notifiable event, polled by the web/desktop app to show a native notification. */
export interface NotifyEvent {
  id: string;
  key: NotifyActivityKey;
  title: string;
  body: string;
  actorId: string | null;
  timestamp: string;
}

export function createPushClient(http: HttpClient) {
  return {
    // Register (or refresh) this device's push token for the signed-in user.
    register: (token: string, platform?: 'android' | 'ios') =>
      http.post<{ ok: true }>('/push/register', { token, platform }),
    // Drop this device's token (called on full sign-out).
    unregister: (token: string) => http.post<{ ok: true }>('/push/unregister', { token }),
    // Recent notifiable events since `since` (ISO) — for in-app notifications on web/desktop.
    recent: (since?: string) =>
      http.get<NotifyEvent[]>(`/push/recent${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  };
}
