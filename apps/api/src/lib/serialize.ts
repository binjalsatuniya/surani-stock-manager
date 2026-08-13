import type { User as PrismaUser } from '@prisma/client';
import type { PermissionMap, Role, User, UserPreferences, UserSecurity } from '@surani/shared';

/**
 * `effective` is what the user can actually do once their role and their own exceptions are
 * resolved. Callers that have it (login, /me, the user list) should pass it; without it this falls
 * back to the stored snapshot, which is correct for anyone not yet switched to live roles.
 */
export function toUserDTO(u: PrismaUser, effective?: PermissionMap): User {
  const security = (u.security as Partial<UserSecurity>) ?? {};
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role as Role,
    permissions: effective ?? (u.permissions as unknown as PermissionMap),
    permissionOverrides: (u.permissionOverrides as Partial<PermissionMap> | null) ?? null,
    // Never send pinHash to any client — it's verified server-side only (see auth/quick-unlock routes).
    security: {
      pinEnabled: !!security.pinEnabled,
      pinHash: null,
      biometricEnabled: !!security.biometricEnabled,
      biometricCredentialId: security.biometricCredentialId ?? null,
      // Whether the extra password that gates Login Locations is set (the hash itself never leaves the server).
      locationAccessEnabled: !!(security as Record<string, unknown>).locationAccessHash,
    },
    preferences: (u.preferences as UserPreferences) ?? {},
    isPrimary: u.isPrimary,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
