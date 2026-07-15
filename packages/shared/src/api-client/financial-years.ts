import type { HttpClient } from './http';

export function createFinancialYearsClient(http: HttpClient) {
  return {
    list: () => http.get<string[]>('/financial-years'),
    create: (label: string) => http.post<string>('/financial-years', { label }),
    remove: (label: string) => http.delete<void>(`/financial-years/${label}`),
  };
}
