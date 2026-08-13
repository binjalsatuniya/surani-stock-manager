import { resolvePermissions, type PermissionMap, type Role } from '@surani/shared';
import { prisma } from '../db/prisma';

/**
 * What a user can actually do.
 *
 * Live roles: effective access is the role's permissions with the user's own exceptions on top, so
 * editing a role reaches everyone on it while anything set for one person individually survives.
 *
 * ⚠️ Safety property: a user whose `permissionOverrides` is NULL has not been converted yet, and
 * keeps the full snapshot in `permissions` exactly as before. This is what makes the change safe to
 * deploy ahead of the conversion — nobody's access moves until they are converted deliberately.
 */
export async function effectivePermissionsFor(user: {
  role: string;
  permissions: unknown;
  permissionOverrides?: unknown;
}): Promise<PermissionMap> {
  const overrides = user.permissionOverrides as Partial<PermissionMap> | null | undefined;
  if (overrides == null) {
    // Not converted — behave exactly as before.
    return user.permissions as PermissionMap;
  }
  const rolePerms = await rolePermissions(user.role);
  return resolvePermissions(rolePerms, overrides);
}

/** A role's own permission set, from Role Master. Unknown role = nothing granted. */
export async function rolePermissions(role: Role): Promise<Partial<PermissionMap>> {
  const row = await prisma.role.findFirst({ where: { name: { equals: role, mode: 'insensitive' } } });
  return (row?.permissions as Partial<PermissionMap>) ?? {};
}
