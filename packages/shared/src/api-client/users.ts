import type { HttpClient } from './http';
import type { User, UserPreferences } from '../types';
import type { PermissionMap, Role } from '../permissions';

export interface CreateUserInput {
  name: string;
  username: string;
  password: string;
  role: Role;
  permissions?: PermissionMap;
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>> & {
  password?: string;
  /** Under live roles, only this person's exceptions — everything else follows their role. */
  permissionOverrides?: Partial<PermissionMap>;
  // Which activities notify this user (admin-managed, merged into preferences.notify server-side).
  notifyPrefs?: Record<string, boolean>;
};

export function createUsersClient(http: HttpClient) {
  return {
    list: () => http.get<User[]>('/users'),
    create: (input: CreateUserInput) => http.post<User>('/users', input),
    update: (id: string, input: UpdateUserInput) => http.patch<User>(`/users/${id}`, input),
    // Any user changes their OWN username/password (needs their current password).
    updateMyLogin: (input: { currentPassword: string; username?: string; password?: string }) =>
      http.patch<User>('/users/me/login', input),
    // JAYNIL passes their login password to delete immediately; other admins omit it and the
    // deletion is queued for JAYNIL's approval. Returns { deleted } or { queued }.
    remove: (id: string, password?: string) =>
      http.post<{ deleted?: boolean; queued?: boolean }>(`/users/${id}/delete`, { password }),
    setPin: (id: string, pin: string | null) =>
      http.post<User>(`/users/${id}/security/pin`, { pin }),
    setBiometric: (id: string, enabled: boolean, credentialId?: string) =>
      http.post<User>(`/users/${id}/security/biometric`, { enabled, credentialId }),
    // Save this user's own UI preferences (e.g. Dashboard layout). Self only, server-enforced.
    setPreferences: (id: string, preferences: UserPreferences) =>
      http.patch<User>(`/users/${id}/preferences`, preferences),
  };
}
