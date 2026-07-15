import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const HINT_KEY = 'surani-quick-unlock-hint';

export interface QuickUnlockHint {
  userId: string;
  username: string;
}

// expo-secure-store has no web implementation (throws on the `expo start --web` dev target used
// for browser-based preview testing); guard every call so that's a graceful no-op there instead
// of crashing — real devices (Expo Go / EAS builds) use the native Keychain/Keystore normally.
export async function rememberQuickUnlockUser(userId: string, username: string) {
  try {
    await SecureStore.setItemAsync(HINT_KEY, JSON.stringify({ userId, username }));
  } catch {
    /* not available on this platform (e.g. web preview) */
  }
}

export async function forgetQuickUnlockUser() {
  try {
    await SecureStore.deleteItemAsync(HINT_KEY);
  } catch {
    /* ignore */
  }
}

export async function getQuickUnlockHint(): Promise<QuickUnlockHint | null> {
  try {
    const raw = await SecureStore.getItemAsync(HINT_KEY);
    return raw ? (JSON.parse(raw) as QuickUnlockHint) : null;
  } catch {
    return null;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

/**
 * Prompts Face ID / fingerprint. On success, the caller reads the refresh token from
 * SecureStore (already gated by the OS biometric prompt) and exchanges it via /auth/refresh —
 * this is a real re-auth shortcut (unlocks the actual stored session), not a cosmetic check.
 */
export async function promptBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Surani and Sons',
      fallbackLabel: 'Use PIN instead',
    });
    return result.success;
  } catch {
    return false;
  }
}
