import type { HttpClient } from './http';

export interface UnpaidInvoice {
  outwardId: string;
  invNo: string | null;
  date: string;
  amount: number;
  balance: number;
  dueDate: string | null;
  dueDays: number | null;
}

export interface DueLedgerGroup {
  party: { id: string; name: string; phone: string | null };
  entries: UnpaidInvoice[];
  total: number;
}

export interface PartyLedgerEntry {
  date: string;
  description: string;
  dr: number;
  cr: number;
  /** Value before tax (sales/purchases only; absent on payments, freight and handling). */
  taxable?: number;
  /** GST portion of the entry (sales/purchases only). */
  tax?: number;
  payStatus?: string;
}

export interface PayableGroup {
  party: { id: string; name: string; phone: string | null };
  amount: number;
}

export function createLedgerClient(http: HttpClient) {
  return {
    due: (salesPersonId?: string) =>
      http.get<DueLedgerGroup[]>(`/ledger/due${salesPersonId ? `?salesPersonId=${salesPersonId}` : ''}`),
    payable: () => http.get<PayableGroup[]>('/ledger/payable'),
    party: (partyId: string) => http.get<PartyLedgerEntry[]>(`/ledger/party/${partyId}`),
  };
}
