import type { HttpClient } from './http';
import type { Outward } from '../types';

export interface CreateOrderInput {
  date: string;
  partyId: string;
  itemId: string;
  qty: number;
  rate: number;
  gstPct?: number;
  deliveryType: 'ExWorks' | 'FOR';
  invNo?: string | null;
  note?: string | null;
  deliveryDate?: string | null;
}

export interface DispatchInput {
  invNo: string;
  invDate: string;
  transporterId?: string | null;
  freightRate?: number;
  handlingAgentId?: string | null;
  handlingRate?: number;
  vehicle?: string | null;
}

export function createOrdersClient(http: HttpClient) {
  return {
    place: (input: CreateOrderInput) => http.post<Outward>('/orders', input),
  };
}

export function createOrderbookClient(http: HttpClient) {
  return {
    list: (params?: { fy?: string; fulfil?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<Outward[]>(`/orderbook${qs ? `?${qs}` : ''}`);
    },
    dispatch: (id: string, input: DispatchInput) => http.post<Outward>(`/orderbook/${id}/dispatch`, input),
    deliver: (id: string) => http.post<Outward>(`/orderbook/${id}/deliver`),
    cancel: (id: string, note?: string) => http.post<Outward>(`/orderbook/${id}/cancel`, { note }),
    restore: (id: string) => http.post<Outward>(`/orderbook/${id}/restore`),
  };
}
