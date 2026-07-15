import type { HttpClient } from './http';
import type { Inward } from '../types';

export interface CreateInwardInput {
  date: string;
  partyId: string;
  itemId: string;
  qty: number;
  rate: number;
  gstPct?: number;
  handlingRate?: number;
  handlingAgentId?: string | null;
  invNo?: string | null;
  invDate?: string | null;
  deliveryType?: 'ExWorks' | 'FOR' | null;
  transporterId?: string | null;
  freightRate?: number;
  vehicle?: string | null;
  note?: string | null;
}

export interface EditInwardInput {
  date?: string;
  invNo?: string | null;
  invDate?: string | null;
  partyId?: string;
  itemId?: string;
  qty?: number;
  rate?: number;
  gstPct?: number;
  handlingRate?: number;
  handlingAgentId?: string | null;
  deliveryType?: 'ExWorks' | 'FOR' | null;
  transporterId?: string | null;
  freightRate?: number;
  vehicle?: string | null;
  note?: string | null;
}

export interface MarkInwardInput {
  invNo?: string | null;
  invDate?: string | null;
  handlingAgentId?: string | null;
  handlingRate?: number;
}

export function createInwardClient(http: HttpClient) {
  return {
    list: (params?: { fy?: string; partyId?: string; itemId?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<Inward[]>(`/inward${qs ? `?${qs}` : ''}`);
    },
    create: (input: CreateInwardInput) => http.post<Inward>('/inward', input),
    update: (id: string, input: EditInwardInput) => http.patch<Inward>(`/inward/${id}`, input),
    // Step 2: mark a pending inward as received (posts handling/freight, counts stock & dues).
    mark: (id: string, input: MarkInwardInput) => http.post<Inward>(`/inward/${id}/mark`, input),
    remove: (id: string) => http.delete<void>(`/inward/${id}`),
  };
}
