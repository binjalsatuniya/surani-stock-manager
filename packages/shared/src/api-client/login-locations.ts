import type { HttpClient } from './http';
import type { LoginLocation } from '../types';

export interface CreateLoginLocationInput {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

export function createLoginLocationsClient(http: HttpClient) {
  return {
    create: (input: CreateLoginLocationInput) => http.post<{ id: string }>('/login-locations', input),
    // Used only when no access password is set (returns 403 once one is configured).
    list: () => http.get<LoginLocation[]>('/login-locations'),
    // Is the extra access password currently set?
    accessStatus: () => http.get<{ enabled: boolean }>('/login-locations/access-status'),
    // Set / change / remove it (`next: ''` removes; changing/removing needs the current one).
    setAccess: (input: { current?: string; next: string }) =>
      http.post<{ enabled: boolean }>('/login-locations/access', input),
    // View the locations, supplying the access password when one is set.
    view: (password?: string) => http.post<LoginLocation[]>('/login-locations/view', { password }),
  };
}
