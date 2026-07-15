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
    list: () => http.get<LoginLocation[]>('/login-locations'),
  };
}
