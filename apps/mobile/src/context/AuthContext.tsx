import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@surani/shared';
import { api, getStoredRefreshToken, persistSession, clearSession } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser, biometricAvailable, promptBiometric } from '../lib/quickUnlock';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  unlockWithBiometric: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function afterLogin(setUser: (u: User) => void, user: User, refreshToken?: string) {
  setUser(user);
  await persistSession(refreshToken);
  if (user.security.biometricEnabled) await rememberQuickUnlockUser(user.id, user.username);
  else await forgetQuickUnlockUser();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const refreshToken = await getStoredRefreshToken();
        if (!refreshToken) {
          setLoading(false);
          return;
        }
        const res = await api.auth.refresh(refreshToken);
        await afterLogin(setUser, res.user, res.refreshToken);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(username: string, password: string) {
    const res = await api.auth.login(username, password);
    await afterLogin(setUser, res.user, res.refreshToken);
  }

  /** Real re-auth: OS biometric prompt gates reading the stored refresh token, then exchanges it. */
  async function unlockWithBiometric(): Promise<boolean> {
    const available = await biometricAvailable();
    if (!available) return false;
    const ok = await promptBiometric();
    if (!ok) return false;
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) return false;
    const res = await api.auth.refresh(refreshToken);
    await afterLogin(setUser, res.user, res.refreshToken);
    return true;
  }

  async function logout() {
    const refreshToken = await getStoredRefreshToken();
    await api.auth.logout(refreshToken ?? undefined).catch(() => {});
    await clearSession();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, unlockWithBiometric, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
