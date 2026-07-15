import type { HttpClient } from './http';
import type { AuditLogEntry } from '../types';

export function createAuditLogClient(http: HttpClient) {
  return {
    list: (params?: { target?: string; targetId?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<AuditLogEntry[]>(`/audit-log${qs ? `?${qs}` : ''}`);
    },
  };
}
