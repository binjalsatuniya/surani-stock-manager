import type { HttpClient } from './http';
import type { PermissionMap } from '../permissions';

/** A named permission template. Assigning it pre-fills a user's permissions; it does not govern them. */
export interface RoleTemplate {
  id: string;
  name: string;
  permissions: Partial<PermissionMap>;
}

export function createRolesClient(http: HttpClient) {
  return {
    list: () => http.get<RoleTemplate[]>('/roles'),
    create: (input: { name: string; permissions: Partial<PermissionMap> }) =>
      http.post<RoleTemplate>('/roles', input),
    update: (id: string, input: { name?: string; permissions?: Partial<PermissionMap> }) =>
      http.patch<RoleTemplate>(`/roles/${id}`, input),
    remove: (id: string) => http.delete<{ ok: true }>(`/roles/${id}`),
  };
}
