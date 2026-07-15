import type { HttpClient } from './http';
import type { SalesPerson } from '../types';

export function createSalesPersonsClient(http: HttpClient) {
  return {
    list: () => http.get<SalesPerson[]>('/sales-persons'),
    create: (input: { name: string; phone?: string }) =>
      http.post<SalesPerson>('/sales-persons', input),
    update: (id: string, input: { name?: string; phone?: string | null }) =>
      http.patch<SalesPerson>(`/sales-persons/${id}`, input),
    remove: (id: string) => http.delete<void>(`/sales-persons/${id}`),
  };
}
