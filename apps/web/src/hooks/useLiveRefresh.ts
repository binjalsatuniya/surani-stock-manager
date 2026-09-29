import { useEffect, useRef } from 'react';

/**
 * Keep a page's data fresh without the user having to reload, log out, or restart the app.
 *
 * Every list page already fetches once on mount. This hook adds two more triggers so another user's
 * changes (a new item, an updated sales person, a fresh order) show up on an already-open screen:
 *   1. Window/tab focus — when the user clicks back into the Stock Manager window (or browser tab),
 *      we re-fetch. This is the big one for the desktop app, where people sit on one screen.
 *   2. A quiet timer — while the page is visible, we re-fetch every `intervalMs` (default 45s) so a
 *      screen left open still catches up on its own. The timer pauses when the tab is hidden so we
 *      don't hammer the server in the background.
 *
 * Pass the SAME `reload` function the page's initial useEffect uses. `reload` may change identity
 * between renders; we always call the latest via a ref, so callers don't need to memoise it.
 */
export function useLiveRefresh(reload: () => void | Promise<unknown>, intervalMs = 45_000) {
  const latest = useRef(reload);
  latest.current = reload;

  useEffect(() => {
    const run = () => {
      // Only refresh when the page is actually on screen — no point fetching for a hidden tab.
      if (document.visibilityState === 'visible') {
        void latest.current();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(run, intervalMs);

    return () => {
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [intervalMs]);
}
