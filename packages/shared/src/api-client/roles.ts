import type { HttpClient } from './http';
import type { PermissionMap } from '../permissions';

/** A named permission template. Assigning it pre-fills a user's permissions; it does not govern them. */
export interface RoleTemplate {
  id: string;
  name: string;
  permissions: Partial<PermissionMap>;
}

/** What the one-time switch to live roles would do to one user. */
export interface LiveRolePlanRow {
  id: string;
  name: string;
  role: string;
  alreadyConverted: boolean;
  extra: string[];
  removed: string[];
  accessUnchanged: boolean;
}

export interface LiveRolePlan {
  plan: LiveRolePlanRow[];
  /** False if any user would end up with different access — the conversion refuses to run. */
  safe: boolean;
}

export function createRolesClient(http: HttpClient) {
  return {
    list: () => http.get<RoleTemplate[]>('/roles'),
    /** Read-only: what switching to live roles would do. */
    livePreview: () => http.get<LiveRolePlan>('/roles/live/preview'),
    liveApply: () => http.post<{ applied: number; plan: LiveRolePlanRow[]; message?: string }>('/roles/live/apply', {}),
    create: (input: { name: string; permissions: Partial<PermissionMap> }) =>
      http.post<RoleTemplate>('/roles', input),
    update: (id: string, input: { name?: string; permissions?: Partial<PermissionMap> }) =>
      http.patch<RoleTemplate>(`/roles/${id}`, input),
    remove: (id: string) => http.delete<{ ok: true }>(`/roles/${id}`),
  };
}
