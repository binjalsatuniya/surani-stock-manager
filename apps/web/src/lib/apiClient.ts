import { createApiClient } from '@surani/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

let accessToken: string | null = null;

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => accessToken,
  setAccessToken: (token) => {
    accessToken = token;
  },
  credentials: 'include', // sends the httpOnly refresh cookie automatically
  refreshAccessToken: async () => {
    try {
      const res = await api.auth.refresh();
      accessToken = res.accessToken;
      return res.accessToken;
    } catch {
      accessToken = null;
      return null;
    }
  },
});
