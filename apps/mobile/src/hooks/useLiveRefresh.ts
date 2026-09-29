import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Keep a screen's data fresh without the user having to leave and come back or restart the app —
 * the mobile counterpart of the web app's useLiveRefresh. Every screen already fetches once on
 * mount; this adds two more triggers so another user's change (a new item, an updated sales person,
 * a fresh order) shows up on an already-open screen:
 *   1. Screen focus — when the user switches back to this tab/screen, we re-fetch (useFocusEffect).
 *   2. App foreground + a quiet timer — when the app returns from the background, and then every
 *      `intervalMs` (default 45s) while it stays foreground, we re-fetch. The timer is cleared while
 *      the app is backgrounded and while the screen is unfocused, so we don't poll needlessly.
 *
 * Pass the SAME `reload` function the screen's initial effect uses. It may change identity between
 * renders; we always call the latest via a ref, so callers don't need to memoise it.
 */
export function useLiveRefresh(reload: () => void | Promise<unknown>, intervalMs = 45_000) {
  const latest = useRef(reload);
  latest.current = reload;

  useFocusEffect(
    useCallback(() => {
      // Runs on focus and re-runs on every refocus. Fetch immediately, then poll while focused.
      const run = () => {
        if (AppState.currentState === 'active') void latest.current();
      };
      run();
      const timer = setInterval(run, intervalMs);
      return () => clearInterval(timer);
    }, [intervalMs])
  );

  useEffect(() => {
    // Also refresh the moment the app comes back to the foreground from the background.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void latest.current();
    });
    return () => sub.remove();
  }, []);
}
