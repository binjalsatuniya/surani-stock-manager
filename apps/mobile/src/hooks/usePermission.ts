import { hasPermission, type PermissionKey } from '@surani/shared';
import { useAuth } from '../context/AuthContext';

export function usePermission() {
  const { user } = useAuth();
  return (perm: PermissionKey) => (user ? hasPermission(user.role, user.permissions, perm) : false);
}
