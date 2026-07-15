import type { HttpClient } from './http';
import type { SalesPersonExpense } from '../types';

export interface CreateExpenseInput {
  salesPersonId: string;
  date: string;
  amount: number;
  expenseFor: string;
  attachment?: string | null; // data: URL (base64) of the invoice image/PDF
  attachmentName?: string | null;
}

export function createExpensesClient(http: HttpClient) {
  return {
    list: (params?: { salesPersonId?: string }) => {
      const qs = params?.salesPersonId ? `?salesPersonId=${encodeURIComponent(params.salesPersonId)}` : '';
      return http.get<SalesPersonExpense[]>(`/expenses${qs}`);
    },
    create: (input: CreateExpenseInput) => http.post<SalesPersonExpense>('/expenses', input),
    remove: (id: string) => http.delete<void>(`/expenses/${id}`),
  };
}
