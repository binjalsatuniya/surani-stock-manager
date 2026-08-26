import { useEffect, useRef } from 'react';
import { api } from '../lib/apiClient';

// While the app is open (desktop or browser), poll the server for recent notifiable events and raise
// a native OS notification for each new one. The phone gets a real push instead; the desktop has no
// push channel, so this is how it stays informed. Which events fire is governed by the same per-user
// notification opt-in used for the phone, applied server-side; here we only render what comes back.
//
// Baseline is "now" at mount, so you are only alerted about things that happen while the app is open
// — never a backlog on sign-in. Your own actions are never returned.
const POLL_MS = 45000;

export function useDesktopNotifications(userId: string | undefined) {
  const since = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!userId) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    let stopped = false;
    let timer: number | undefined;

    async function ensurePermission(): Promise<boolean> {
      if (Notification.permission === 'granted') return true;
      if (Notification.permission === 'denied') return false;
      try {
        return (await Notification.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }

    async function poll() {
      if (stopped) return;
      try {
        const events = await api.push.recent(since.current);
        for (const e of events) {
          // tag = id so the OS collapses a duplicate if the same event somehow arrives twice.
          new Notification(e.title, { body: e.body, tag: e.id });
          if (e.timestamp > since.current) since.current = e.timestamp;
        }
      } catch {
        /* transient network/auth hiccup — try again next tick */
      }
    }

    (async () => {
      const ok = await ensurePermission();
      if (!ok || stopped) return;
      poll();
      timer = window.setInterval(poll, POLL_MS);
    })();

    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
