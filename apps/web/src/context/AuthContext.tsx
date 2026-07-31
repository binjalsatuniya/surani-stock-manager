import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@surani/shared';
import { api } from '../lib/apiClient';
import { rememberQuickUnlockUser, forgetQuickUnlockUser } from '../lib/quickUnlock';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPin: (userId: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: User) => void;
  // Login Locations is hidden from the menu until unlocked with its access password.
  llUnlocked: boolean;
  llPassword: string | null;
  unlockLoginLocations: (password: string) => Promise<void>;
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
  const [llUnlocked, setLlUnlocked] = useState(false);
  const [llPassword, setLlPassword] = useState<string | null>(null);
  const navigate = useNavigate();

  // Verify the access password by attempting to view; on success, reveal Login Locations for
  // this session and remember the password so the page loads without asking again.
  async function unlockLoginLocations(password: string) {
    await api.loginLocations.view(password);
    setLlPassword(password);
    setLlUnlocked(true);
  }

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
    navigate('/'); // always land on the Dashboard after signing in
  }

  async function loginWithPin(userId: string, pin: string) {
    const res = await api.auth.quickUnlockPin(userId, pin);
    afterLogin(setUser, res.user);
    navigate('/');
  }

  async function logout() {
    await api.auth.logout().catch(() => {});
    setUser(null);
    setLlUnlocked(false);
    setLlPassword(null);
    navigate('/'); // reset so the next sign-in opens on the Dashboard
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithPin, logout, updateUser: setUser, llUnlocked, llPassword, unlockLoginLocations }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
