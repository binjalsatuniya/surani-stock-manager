import { Router } from 'express';
import {
  BUILT_IN_ROLES,
  PERMS,
  defaultPermsForRole,
  diffFromRole,
  resolvePermissions,
  type PermissionMap,
  type Role,
} from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { logActivity } from '../../lib/audit';

/**
 * One-time switch to live roles.
 *
 * Everyone currently carries a full copy of every permission, taken from their role when they were
 * created — which is why editing a role changes nobody. This works out, for each user, which of
 * their permissions actually differ from their role, and keeps only those as personal exceptions.
 * Everything else then follows the role from that point on.
 *
 * Nobody's access changes on the day: the effective result is checked against the snapshot for
 * every user, and the conversion refuses to write if any of them would come out different.
 */
export const roleConvertRouter = Router();
roleConvertRouter.use(authenticate);

interface UserPlan {
  id: string;
  name: string;
  role: string;
  alreadyConverted: boolean;
  /** Permissions this user has that the role does not give them. */
  extra: string[];
  /** Permissions the role gives that this user does not have. */
  removed: string[];
  /** The conversion is only safe if this is true for every user. */
  accessUnchanged: boolean;
}

/** Built-in roles have no row until now — seed them from their coded defaults so they are editable. */
async function ensureBuiltInRoles(): Promise<void> {
  for (const role of BUILT_IN_ROLES) {
    if (role === 'superadmin') continue; // bypasses every check; a permission set would be a lie
    const existing = await prisma.role.findFirst({ where: { name: { equals: role, mode: 'insensitive' } } });
    if (!existing) {
      await prisma.role.create({ data: { name: role, permissions: defaultPermsForRole(role) } });
    }
  }
}

async function buildPlan(): Promise<{ plan: UserPlan[]; safe: boolean }> {
  const [users, roles] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.role.findMany(),
  ]);
  const roleByName = new Map(roles.map((r) => [r.name.toLowerCase(), r.permissions as Partial<PermissionMap>]));

  const plan: UserPlan[] = [];
  for (const u of users) {
    // The Super Admin bypasses permission checks entirely, so there is nothing to convert.
    if (u.role === 'superadmin') continue;

    const snapshot = u.permissions as Partial<PermissionMap>;
    const rolePerms = roleByName.get(u.role.toLowerCase()) ?? {};
    const overrides = diffFromRole(rolePerms, snapshot);
    const after = resolvePermissions(rolePerms, overrides);

    plan.push({
      id: u.id,
      name: u.name,
      role: u.role,
      alreadyConverted: u.permissionOverrides != null,
      extra: PERMS.filter((p) => overrides[p.id] === true).map((p) => p.label),
      removed: PERMS.filter((p) => overrides[p.id] === false).map((p) => p.label),
      // Proof that nobody gains or loses anything by converting.
      accessUnchanged: PERMS.every((p) => after[p.id] === !!snapshot[p.id]),
    });
  }
  return { plan, safe: plan.every((p) => p.accessUnchanged) };
}

/** Read-only: what the conversion would do. Writes nothing. */
roleConvertRouter.get(
  '/preview',
  requireRole('superadmin'),
  asyncHandler(async (_req, res) => {
    await ensureBuiltInRoles();
    res.json(await buildPlan());
  })
);

roleConvertRouter.post(
  '/apply',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    await ensureBuiltInRoles();
    const { plan, safe } = await buildPlan();
    if (!safe) {
      res.status(409).json({
        applied: 0,
        message: 'Conversion refused: at least one user would end up with different access.',
        plan,
      });
      return;
    }

    const roles = await prisma.role.findMany();
    const roleByName = new Map(roles.map((r) => [r.name.toLowerCase(), r.permissions as Partial<PermissionMap>]));

    let applied = 0;
    for (const p of plan) {
      const u = await prisma.user.findUnique({ where: { id: p.id } });
      if (!u) continue;
      const overrides = diffFromRole(roleByName.get(u.role.toLowerCase()) ?? {}, u.permissions as Partial<PermissionMap>);
      await prisma.user.update({ where: { id: u.id }, data: { permissionOverrides: overrides } });
      applied++;
    }
    await logActivity(prisma, req.user!, 'edit', 'user', 'live-roles', `Switched ${applied} users to live roles`);
    res.json({ applied, plan });
  })
);
