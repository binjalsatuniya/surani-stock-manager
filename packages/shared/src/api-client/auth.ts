import type { HttpClient } from './http';
import type { User } from '../types';

export interface LoginResponse {
  accessToken: string;
  user: User;
  /** Present only for mobile clients (web relies on the httpOnly refresh cookie). */
  refreshToken?: string;
}

export function createAuthClient(http: HttpClient) {
  return {
    login: (username: string, password: string) =>
      http.post<LoginResponse>('/auth/login', { username, password }),
    refresh: (refreshToken?: string) =>
      http.post<LoginResponse>('/auth/refresh', refreshToken ? { refreshToken } : undefined),
    logout: (refreshToken?: string) =>
      http.post<void>('/auth/logout', refreshToken ? { refreshToken } : undefined),
    quickUnlockPin: (userId: string, pin: string) =>
      http.post<LoginResponse>('/auth/quick-unlock/pin', { userId, pin }),
    quickUnlockBiometric: (userId: string, assertion: unknown) =>
      http.post<LoginResponse>('/auth/quick-unlock/biometric', { userId, assertion }),
    me: () => http.get<User>('/auth/me'),
  };
}
