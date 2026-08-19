import type { HttpClient } from './http';
import type { Trip } from '../types';

export function createTripsClient(http: HttpClient) {
  return {
    list: () => http.get<Trip[]>('/trips'),
    create: (input: { name: string; note?: string | null }) => http.post<Trip>('/trips', input),
    remove: (id: string) => http.delete<void>(`/trips/${id}`),
  };
}
