import type { HttpClient } from './http';

export interface DashboardKpis {
  totalItems: number;
  receivable: number;
  payable: number;
  netPosition: number;
  lowStockCount: number;
  pendingOrders: number;
}

export function createDashboardClient(http: HttpClient) {
  return {
    kpis: () => http.get<DashboardKpis>('/dashboard/kpis'),
  };
}
