import type { HttpClient } from './http';
import type { Payment, PaymentDirection, PaymentMode } from '../types';
import type { UnpaidInvoice } from './ledger';

export interface CreatePaymentInput {
  date: string;
  partyId: string;
  dir: PaymentDirection;
  amount: number;
  mode: PaymentMode;
  note?: string | null;
  outwardIds?: string[];
}

export function createPaymentsClient(http: HttpClient) {
  return {
    list: (params?: { fy?: string; partyId?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<Payment[]>(`/payments${qs ? `?${qs}` : ''}`);
    },
    create: (input: CreatePaymentInput) => http.post<Payment>('/payments', input),
    remove: (id: string) => http.delete<void>(`/payments/${id}`),
    unpaidInvoices: (partyId: string) =>
      http.get<UnpaidInvoice[]>(`/payments/unpaid-invoices?partyId=${partyId}`),
  };
}
