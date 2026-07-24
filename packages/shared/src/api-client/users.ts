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

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'password'>> & { password?: string };

export function createUsersClient(http: HttpClient) {
  return {
    list: () => http.get<User[]>('/users'),
    create: (input: CreateUserInput) => http.post<User>('/users', input),
    update: (id: string, input: UpdateUserInput) => http.patch<User>(`/users/${id}`, input),
    remove: (id: string) => http.delete<void>(`/users/${id}`),
    setPin: (id: string, pin: string | null) =>
      http.post<User>(`/users/${id}/security/pin`, { pin }),
    setBiometric: (id: string, enabled: boolean, credentialId?: string) =>
      http.post<User>(`/users/${id}/security/biometric`, { enabled, credentialId }),
    // Save this user's own UI preferences (e.g. Dashboard layout). Self only, server-enforced.
    setPreferences: (id: string, preferences: UserPreferences) =>
      http.patch<User>(`/users/${id}/preferences`, preferences),
  };
}
