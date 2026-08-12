import { Router } from 'express';
import { z } from 'zod';
import { BUILT_IN_ROLES } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { logActivity } from '../../lib/audit';

/**
 * Role Master — named permission templates, e.g. "Warehouse".
 *
 * These are templates, not live authority. Assigning a role pre-fills a user's permission grid;
 * from then on the user carries their own set, and permission checks read that set exactly as
 * before. So editing a role never silently changes what an existing user can already do — which
 * is the point: access should not shift under people without someone deciding it.
 */
export const rolesRouter = Router();
rolesRouter.use(authenticate);

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Give the role a name of at least 2 characters')
  .max(40, 'Role name is too long');

/** Reading the list is open to anyone who manages users — they need it to fill the dropdown. */
rolesRouter.get(
  '/',
  requirePermission('manage_users'),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
    res.json(roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions })));
  })
);

function assertNotBuiltIn(name: string) {
  if ((BUILT_IN_ROLES as readonly string[]).includes(name.toLowerCase())) {
    throw new HttpError(409, `"${name}" is a built-in role and cannot be redefined.`);
  }
}

rolesRouter.post(
  '/',
  requirePermission('manage_roles'),
  asyncHandler(async (req, res) => {
    const { name, permissions } = z
      .object({ name: nameSchema, permissions: z.record(z.boolean()).default({}) })
      .parse(req.body);
    assertNotBuiltIn(name);

    const clash = await prisma.role.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (clash) throw new HttpError(409, `A role named "${clash.name}" already exists.`);

    const role = await prisma.role.create({ data: { name, permissions } });
    await logActivity(prisma, req.user!, 'create', 'role', role.id, `Role created: ${role.name}`);
    res.status(201).json({ id: role.id, name: role.name, permissions: role.permissions });
  })
);

rolesRouter.patch(
  '/:id',
  requirePermission('manage_roles'),
  asyncHandler(async (req, res) => {
    const { name, permissions } = z
      .object({ name: nameSchema.optional(), permissions: z.record(z.boolean()).optional() })
      .parse(req.body);
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Role not found');

    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      assertNotBuiltIn(name);
      const clash = await prisma.role.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: existing.id } },
      });
      if (clash) throw new HttpError(409, `A role named "${clash.name}" already exists.`);
      // Users store the role by name, so a rename has to follow them or they lose their label.
      await prisma.user.updateMany({ where: { role: existing.name }, data: { role: name } });
    }

    const role = await prisma.role.update({
      where: { id: existing.id },
      data: { ...(name ? { name } : {}), ...(permissions ? { permissions } : {}) },
    });
    await logActivity(prisma, req.user!, 'edit', 'role', role.id, `Role updated: ${role.name}`);
    res.json({ id: role.id, name: role.name, permissions: role.permissions });
  })
);

rolesRouter.delete(
  '/:id',
  requirePermission('manage_roles'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Role not found');

    // Deleting a role that people are on would leave them with a label pointing at nothing.
    const inUse = await prisma.user.count({ where: { role: existing.name } });
    if (inUse > 0) {
      throw new HttpError(
        409,
        `${inUse} user${inUse === 1 ? ' is' : 's are'} on the "${existing.name}" role. Move them to another role first.`
      );
    }

    await prisma.role.delete({ where: { id: existing.id } });
    await logActivity(prisma, req.user!, 'delete', 'role', existing.id, `Role deleted: ${existing.name}`);
    res.json({ ok: true });
  })
);
