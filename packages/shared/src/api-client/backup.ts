import type { HttpClient } from './http';

export function createBackupClient(http: HttpClient) {
  return {
    export: () => http.get<{ version: number; exportedAt: string; db: Record<string, unknown[]> }>('/backup/export'),
    import: (payload: { version: number; db: Record<string, unknown[]> }) =>
      http.post<{ ok: true }>('/backup/import', payload),
  };
}
