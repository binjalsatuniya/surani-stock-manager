// Client-only hint (not a security boundary) so the login screen knows to offer the PIN-unlock
// shortcut for the last user on THIS device — the actual PIN is always verified server-side.
const KEY = 'surani-quick-unlock-user';

export interface QuickUnlockHint {
  userId: string;
  username: string;
}

export function rememberQuickUnlockUser(userId: string, username: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ userId, username }));
  } catch {
    /* ignore (private browsing, etc.) */
  }
}

export function forgetQuickUnlockUser() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getQuickUnlockHint(): QuickUnlockHint | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuickUnlockHint) : null;
  } catch {
    return null;
  }
}
