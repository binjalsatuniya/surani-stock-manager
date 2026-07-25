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

export interface ExpenseRule {
  backdateDays: number | null; // max days an expense can be back-dated; null = no limit
  today: string; // today's date (YYYY-MM-DD) in the business timezone
}

export function createExpensesClient(http: HttpClient) {
  return {
    getRule: () => http.get<ExpenseRule>('/expenses/rule'),
    setRule: (backdateDays: number | null) => http.patch<ExpenseRule>('/expenses/rule', { backdateDays }),
    list: (params?: { salesPersonId?: string }) => {
      const qs = params?.salesPersonId ? `?salesPersonId=${encodeURIComponent(params.salesPersonId)}` : '';
      return http.get<SalesPersonExpense[]>(`/expenses${qs}`);
    },
    create: (input: CreateExpenseInput) => http.post<SalesPersonExpense>('/expenses', input),
    setPaid: (id: string, paid: boolean, details?: { paidBy?: string | null; paidMode?: string | null }) =>
      http.patch<SalesPersonExpense>(`/expenses/${id}/paid`, { paid, ...details }),
    remove: (id: string) => http.delete<void>(`/expenses/${id}`),
  };
}
