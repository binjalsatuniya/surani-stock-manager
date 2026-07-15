import type { User as PrismaUser } from '@prisma/client';
import type { PermissionMap, Role, User, UserSecurity } from '@surani/shared';

export function toUserDTO(u: PrismaUser): User {
  const security = (u.security as Partial<UserSecurity>) ?? {};
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role as Role,
    permissions: u.permissions as unknown as PermissionMap,
    // Never send pinHash to any client — it's verified server-side only (see auth/quick-unlock routes).
    security: {
      pinEnabled: !!security.pinEnabled,
      pinHash: null,
      biometricEnabled: !!security.biometricEnabled,
      biometricCredentialId: security.biometricCredentialId ?? null,
    },
    isPrimary: u.isPrimary,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
