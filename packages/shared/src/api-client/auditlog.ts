import type { HttpClient } from './http';
import type { AuditLogEntry } from '../types';

export function createAuditLogClient(http: HttpClient) {
  return {
    list: (params?: { target?: string; targetId?: string }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return http.get<AuditLogEntry[]>(`/audit-log${qs ? `?${qs}` : ''}`);
    },
    // Undo a wrong edit/delete, restoring the record to its saved "before" snapshot.
    reverse: (id: string) => http.post<{ ok: true }>(`/audit-log/${id}/reverse`, {}),
  };
}
