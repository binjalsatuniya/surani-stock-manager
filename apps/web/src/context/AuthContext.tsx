import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@surani/shared';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser } from '../lib/quickUnlock';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPin: (userId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function afterLogin(setUser: (u: User) => void, user: User) {
  setUser(user);
  if (user.security.pinEnabled) rememberQuickUnlockUser(user.id, user.username);
  else forgetQuickUnlockUser();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On boot, try to silently refresh using the httpOnly cookie (survives page reloads).
    (async () => {
      try {
        const res = await api.auth.refresh();
        afterLogin(setUser, res.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(username: string, password: string) {
    const res = await api.auth.login(username, password);
    afterLogin(setUser, res.user);
  }

  async function loginWithPin(userId: string, pin: string) {
    const res = await api.auth.quickUnlockPin(userId, pin);
    afterLogin(setUser, res.user);
  }

  async function logout() {
    await api.auth.logout().catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithPin, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
