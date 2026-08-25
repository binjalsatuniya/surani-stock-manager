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
  invoiceFile?: string | null;
  invoiceFileName?: string | null;
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
    // Split a still-pending order into several deliveries. `parts` are the quantities and must add up
    // to the order's quantity; the first part stays on this order, the rest become new orders.
    split: (id: string, parts: number[]) => http.post<Outward[]>(`/orderbook/${id}/split`, { parts }),
    deliver: (id: string) => http.post<Outward>(`/orderbook/${id}/deliver`),
    cancel: (id: string, note?: string) => http.post<Outward>(`/orderbook/${id}/cancel`, { note }),
    getInvoice: (id: string) => http.get<{ invoiceFile: string | null; invoiceFileName: string | null }>(`/orderbook/${id}/invoice`),
    restore: (id: string) => http.post<Outward>(`/orderbook/${id}/restore`),
  };
}
