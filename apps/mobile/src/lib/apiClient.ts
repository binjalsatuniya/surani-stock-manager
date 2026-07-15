import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@surani/shared';

const REFRESH_TOKEN_KEY = 'surani-refresh-token';

// Set in app.json -> expo.extra.apiBaseUrl. Must be the dev machine's LAN IP (not localhost)
// so a phone on Expo Go can reach it — see apps/mobile/README for setup.
const API_BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl as string) || 'http://localhost:4000';

let accessToken: string | null = null;

// expo-secure-store has no web implementation (throws on the `expo start --web` dev target used
// for browser-based preview testing); guard every call so login/session logic degrades gracefully
// there instead of crashing — real devices (Expo Go / EAS builds) use the native Keychain/Keystore.
export async function getStoredRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function storeRefreshToken(token: string | null) {
  try {
    if (token) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    /* not available on this platform (e.g. web preview) */
  }
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  // Mobile has no cookie jar shared with a browser — refresh token travels in the request body.
  credentials: 'omit',
  refreshAccessToken: async () => {
    try {
      const refreshToken = await getStoredRefreshToken();
      if (!refreshToken) return null;
      const res = await api.auth.refresh(refreshToken);
      if (res.refreshToken) await storeRefreshToken(res.refreshToken);
      return res.accessToken;
    } catch {
      accessToken = null;
      return null;
    }
  },
});

export async function persistSession(refreshToken?: string) {
  if (refreshToken) await storeRefreshToken(refreshToken);
}

export async function clearSession() {
  accessToken = null;
  await storeRefreshToken(null);
}
