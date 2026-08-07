import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { PermissionKey } from '@surani/shared';
import { shortcutEnabled } from '../routes/ShortcutsPage';

// Alt+<key> jumps to a section (only if the user has permission); Ctrl+S saves the open form.
const NAV: { alt: string; to: string; perm?: PermissionKey }[] = [
  { alt: 'd', to: '/', perm: 'view_dashboard' },
  { alt: 'o', to: '/orderbook', perm: 'view_orderbook' },
  { alt: 'i', to: '/inward', perm: 'view_inward' },
  { alt: 't', to: '/outward', perm: 'view_outward' },
  { alt: 'p', to: '/payments', perm: 'view_payments' },
  { alt: 'r', to: '/parties', perm: 'view_parties' },
  { alt: 'm', to: '/items', perm: 'view_items' },
  { alt: 'l', to: '/live-stock', perm: 'view_live_stock' },
  { alt: 'e', to: '/expenses', perm: 'view_expenses' },
];

export function useAppShortcuts(navigate: NavigateFunction, can: (p: PermissionKey) => boolean) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!shortcutEnabled('navKeys')) return;

      // Ctrl+S (or Cmd+S) → save the primary button of the form the cursor is in (or the page).
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        const active = document.activeElement as HTMLElement | null;
        const container = (active?.closest('form, .card') as HTMLElement) || document.body;
        const btn = (container.querySelector('button.btn-primary:not([disabled])')
          || document.querySelector('button.btn-primary:not([disabled])')) as HTMLButtonElement | null;
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }

      // Alt+<key> → navigate (ignore when typing so Alt combos in fields aren't hijacked).
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const item = NAV.find((n) => n.alt === e.key.toLowerCase());
        if (!item) return;
        if (item.perm && !can(item.perm)) return; // no access → do nothing
        e.preventDefault();
        navigate(item.to);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate, can]);
}
