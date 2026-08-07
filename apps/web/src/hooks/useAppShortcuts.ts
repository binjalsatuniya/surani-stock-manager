import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { PermissionKey } from '@surani/shared';
import { shortcutEnabled } from '../routes/ShortcutsPage';

// The Alt+<key> "jump to section" shortcuts. The key is customizable — an override is stored in
// localStorage under `navkey.<path>`; if none is set the default letter is used.
export const NAV_SHORTCUTS: { label: string; to: string; defaultKey: string; perm?: PermissionKey }[] = [
  { label: 'Dashboard', to: '/', defaultKey: 'd', perm: 'view_dashboard' },
  { label: 'Order Book', to: '/orderbook', defaultKey: 'o', perm: 'view_orderbook' },
  { label: 'Inward', to: '/inward', defaultKey: 'i', perm: 'view_inward' },
  { label: 'Outward', to: '/outward', defaultKey: 't', perm: 'view_outward' },
  { label: 'Payment Due', to: '/payments', defaultKey: 'p', perm: 'view_payments' },
  { label: 'Parties', to: '/parties', defaultKey: 'r', perm: 'view_parties' },
  { label: 'Items', to: '/items', defaultKey: 'm', perm: 'view_items' },
  { label: 'Live Stock & Rate', to: '/live-stock', defaultKey: 'l', perm: 'view_live_stock' },
  { label: 'Expenses', to: '/expenses', defaultKey: 'e', perm: 'view_expenses' },
];

export function getNavKey(to: string, defaultKey: string): string {
  return (localStorage.getItem(`navkey.${to}`) || defaultKey).toLowerCase();
}

export function useAppShortcuts(navigate: NavigateFunction, can: (p: PermissionKey) => boolean) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!shortcutEnabled('navKeys')) return;

      // Ctrl+S / Cmd+S → save the primary button of the form the cursor is in (or the page).
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        const active = document.activeElement as HTMLElement | null;
        const container = (active?.closest('form, .card') as HTMLElement) || document.body;
        const btn = (container.querySelector('button.btn-primary:not([disabled])')
          || document.querySelector('button.btn-primary:not([disabled])')) as HTMLButtonElement | null;
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }

      // Alt+<key> → navigate to the matching section (respecting the user's custom keys + permission).
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        const item = NAV_SHORTCUTS.find((n) => getNavKey(n.to, n.defaultKey) === key);
        if (!item) return;
        if (item.perm && !can(item.perm)) return;
        e.preventDefault();
        navigate(item.to);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate, can]);
}
