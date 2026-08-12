import type { HttpClient } from './http';
import type { Outward, PayStatus } from '../types';

export interface CreateOutwardInput {
  date: string;
  partyId: string;
  itemId: string;
  qty: number;
  rate: number;
  freightRate?: number;
  gstPct?: number;
  handlingRate?: number;
  handlingAgentId?: string | null;
  payStatus?: PayStatus;
  creditDays?: number;
  invNo?: string | null;
  invDate?: string | null;
  transporterId?: string | null;
  note?: string | null;
  /** Historical imports come in already completed; a normal sale leaves this unset ('pending'). */
  fulfil?: 'pending' | 'dispatched' | 'delivered';
}

export interface EditOutwardInput {
  date?: string;
  invNo?: string | null;
  invDate?: string | null;
  partyId?: string;
  itemId?: string;
  qty?: number;
  rate?: number;
  gstPct?: number;
  payStatus?: PayStatus;
  creditDays?: number;
  note?: string | null;
}

export function createOutwardClient(http: HttpClient) {
  return {
    list: (params?: { fy?: string; partyId?: string; itemId?: string; fulfil?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<Outward[]>(`/outward${qs ? `?${qs}` : ''}`);
    },
    create: (input: CreateOutwardInput) => http.post<Outward>('/outward', input),
    update: (id: string, input: EditOutwardInput) => http.patch<Outward>(`/outward/${id}`, input),
    remove: (id: string) => http.delete<void>(`/outward/${id}`),
  };
}
