import type { HttpClient } from './http';
import type { Trip } from '../types';

export function createTripsClient(http: HttpClient) {
  return {
    list: () => http.get<Trip[]>('/trips'),
    create: (input: { name: string; note?: string | null }) => http.post<Trip>('/trips', input),
    // Close (mark paid) or reopen a trip.
    setClosed: (id: string, closed: boolean) => http.patch<Trip>(`/trips/${id}`, { closed }),
    // Mark the whole trip paid: settle its expenses with the given mode/payer, then close it.
    pay: (id: string, details: { paidBy?: string | null; paidMode?: string | null }) =>
      http.post<Trip>(`/trips/${id}/pay`, details),
    remove: (id: string) => http.delete<void>(`/trips/${id}`),
  };
}
