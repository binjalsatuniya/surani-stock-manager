import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { defaultPermsForRole, type Role } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { toUserDTO } from '../../lib/serialize';
import { asyncHandler } from '../../lib/asyncHandler';
import { logActivity } from '../../lib/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';

export const usersRouter = Router();
usersRouter.use(authenticate);

// Roles are no longer a fixed list — Role Master can define more — so this is a plain string,
// checked below against the built-ins and the roles table.
const roleName = z.string().min(1);

/**
 * How much authority a role carries. You may only create or assign a role ranked BELOW your own,
 * which is what stops two admins from managing each other. Custom roles are ordinary users.
 */
const ROLE_RANK: Record<string, number> = { superadmin: 100, admin: 50 };
const rankOf = (role: string | null | undefined) => ROLE_RANK[(role || '').toLowerCase()] ?? 10;

/** Permissions are JAYNIL's alone: nobody else may hand out access, only assign an existing role. */
function assertMayGrantPermissions(actor: { role?: string }) {
  if (actor.role !== 'superadmin') {
    throw new HttpError(403, 'Only the Super Admin can change permissions. Assign a role instead.');
  }
}

/** The role must exist, must not be superadmin, and must rank below the person assigning it. */
async function assertMayAssignRole(actor: { role?: string }, role: string) {
  if (role === 'superadmin') {
    throw new HttpError(403, 'The Super Admin role cannot be assigned to other users');
  }
  const builtIn = ['admin', 'account', 'staff'].includes(role);
  if (!builtIn) {
    const custom = await prisma.role.findFirst({ where: { name: { equals: role, mode: 'insensitive' } } });
    if (!custom) throw new HttpError(400, `There is no role named "${role}".`);
  }
  if (rankOf(role) >= rankOf(actor.role)) {
    throw new HttpError(403, `You can only assign roles below your own (${role} is not below ${actor.role}).`);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(4),
  role: roleName,
  permissions: z.record(z.boolean()).optional(),
});

usersRouter.get(
  '/',
  requirePermission('manage_users'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    res.json(users.map(toUserDTO));
  })
);

usersRouter.post(
  '/',
  requirePermission('manage_users'),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    // Anyone with manage_users may add people, but only below their own level.
    await assertMayAssignRole(req.user!, input.role);
    // Handing out individual permissions is the Super Admin's alone; everyone else assigns a role
    // and the new user starts on that role's set.
    if (input.permissions !== undefined) assertMayGrantPermissions(req.user!);

    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new HttpError(409, 'Username already exists');

    const passwordHash = await bcrypt.hash(input.password, 12);
    // A custom role brings its own template; the built-ins use their coded defaults.
    const template = await prisma.role.findFirst({ where: { name: { equals: input.role, mode: 'insensitive' } } });
    const permissions =
      input.permissions ??
      (template ? (template.permissions as Record<string, boolean>) : defaultPermsForRole(input.role as Role));
    const user = await prisma.user.create({
      data: {
        name: input.name,
        username: input.username,
        passwordHash,
        role: input.role,
        permissions,
        security: { pinEnabled: false, pinHash: null, biometricEnabled: false, biometricCredentialId: null },
      },
    });
    await logActivity(prisma, req.user!, 'create', 'user', user.id, `User created: ${user.name} (${user.role})`);
    res.status(201).json(toUserDTO(user));
  })
);

// Any signed-in user may change THEIR OWN username and/or password (not anyone else's). Requires
// the current password to confirm it's really them. Defined before '/:id' so 'me' isn't captured.
const selfLoginSchema = z.object({
  currentPassword: z.string().min(1),
  username: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
});
usersRouter.patch(
  '/me/login',
  asyncHandler(async (req, res) => {
    const input = selfLoginSchema.parse(req.body);
    const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!me) throw new NotFoundError('User not found');
    const ok = await bcrypt.compare(input.currentPassword, me.passwordHash);
    if (!ok) throw new HttpError(403, 'Current password is incorrect');

    const data: Record<string, unknown> = {};
    if (input.username && input.username !== me.username) {
      const clash = await prisma.user.findUnique({ where: { username: input.username } });
      if (clash) throw new HttpError(409, 'That username is already taken');
      data.username = input.username;
    }
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);
    if (Object.keys(data).length === 0) {
      res.json(toUserDTO(me));
      return;
    }
    const updated = await prisma.user.update({ where: { id: me.id }, data });
    res.json(toUserDTO(updated));
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  role: roleName.optional(),
  permissions: z.record(z.boolean()).optional(),
  // Which activities notify this user (merged into preferences.notify).
  notifyPrefs: z.record(z.boolean()).optional(),
});

usersRouter.patch(
  '/:id',
  requirePermission('manage_users'),
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('User not found');
    // Never allow promoting anyone to Super Admin, and never allow changing the existing
    // Super Admin's role/permissions away (it keeps full access).
    if (input.role === 'superadmin') throw new HttpError(403, 'The Super Admin role cannot be assigned to other users');

    const isSelf = existing.id === req.user!.id;
    // You may only act on someone ranked below you. Without this an admin could edit a fellow
    // admin — reset their password, or restrict them — which is exactly what we are preventing.
    if (!isSelf && rankOf(existing.role) >= rankOf(req.user!.role)) {
      throw new HttpError(403, 'You can only manage users below your own level.');
    }
    // Permissions are the Super Admin's to grant. Everyone else changes a person's role instead.
    if (input.permissions !== undefined) assertMayGrantPermissions(req.user!);
    // A role change is still bound by the same "below your own level" rule.
    if (input.role !== undefined && input.role !== existing.role) {
      await assertMayAssignRole(req.user!, input.role);
    }
    // The main Super Admin can only be edited by itself.
    if (existing.isPrimary && req.user!.id !== existing.id)
      throw new HttpError(403, 'Only the main Super Admin can edit the main Super Admin account');
    // A Super Admin always keeps full access — role/permissions can never be changed.
    if (existing.role === 'superadmin' && (input.role !== undefined || input.permissions !== undefined))
      throw new HttpError(403, 'A Super Admin always has full access and cannot be restricted');
    // Only the main Super Admin may edit another Super Admin (e.g. reset their password/username).
    if (existing.role === 'superadmin' && existing.id !== req.user!.id && !req.user!.isPrimary)
      throw new HttpError(403, 'Only the main Super Admin can edit another Super Admin');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.username !== undefined) data.username = input.username;
    if (input.role !== undefined) data.role = input.role;
    if (input.permissions !== undefined) data.permissions = input.permissions;
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);
    if (input.notifyPrefs !== undefined) {
      const prev = (existing.preferences as Record<string, unknown>) ?? {};
      data.preferences = { ...prev, notify: input.notifyPrefs };
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    await logActivity(prisma, req.user!, 'update', 'user', user.id, `User updated: ${existing.name}`);
    res.json(toUserDTO(user));
  })
);

// Fully remove a user, clearing the rows that would otherwise block the delete (sessions, login
// locations). Other references (audit entries etc.) keep their stored actor name.
async function hardDeleteUser(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId: id } });
    await tx.loginLocation.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });
}

// Delete a user. JAYNIL (primary) must re-enter their own login password to confirm; any other
// admin's deletion is queued for JAYNIL's approval instead of happening immediately.
const deleteUserSchema = z.object({ password: z.string().optional() });
usersRouter.post(
  '/:id/delete',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const { password } = deleteUserSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new NotFoundError('User not found');
    if (target.isPrimary) throw new HttpError(403, 'The main Super Admin account cannot be deleted');
    if (req.params.id === req.user!.id) throw new HttpError(400, 'Cannot delete your own account');
    if (target.role === 'superadmin' && !req.user!.isPrimary)
      throw new HttpError(403, 'Only the main Super Admin can remove another Super Admin');

    if (req.user!.isPrimary) {
      // Re-authenticate JAYNIL with their login password before this destructive action.
      const me = await prisma.user.findUnique({ where: { id: req.user!.id } });
      const ok = password && me ? await bcrypt.compare(password, me.passwordHash) : false;
      if (!ok) throw new HttpError(403, 'Incorrect password');
      await hardDeleteUser(target.id);
      await logActivity(prisma, req.user!, 'delete', 'user', target.id, `User deleted: ${target.name}`);
      res.json({ deleted: true });
      return;
    }

    // Non-primary admin → queue for JAYNIL's approval.
    const existing = await prisma.approvalRequest.findFirst({
      where: { kind: 'delete', target: 'user', targetId: target.id, status: 'pending' },
    });
    if (existing) throw new HttpError(400, 'A deletion request for this user is already pending');
    await prisma.approvalRequest.create({
      data: {
        kind: 'delete',
        target: 'user',
        targetId: target.id,
        payload: {},
        label: `Delete user: ${target.name} (${target.username})`,
        requestedById: req.user!.id,
      },
    });
    res.status(202).json({ queued: true });
  })
);

const setPinSchema = z.object({ pin: z.string().min(4).max(6).nullable() });

usersRouter.post(
  '/:id/security/pin',
  asyncHandler(async (req, res) => {
    const { pin } = setPinSchema.parse(req.body);
    const isSelf = req.params.id === req.user!.id;
    if (!isSelf && req.user!.role !== 'superadmin') {
      throw new HttpError(403, 'Can only set your own PIN');
    }
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('User not found');

    const pinFields = pin
      ? { pinEnabled: true, pinHash: await bcrypt.hash(pin, 12) }
      : { pinEnabled: false, pinHash: null };
    // Merge onto existing security so biometric fields (set independently) aren't clobbered.
    const prevSecurity = (existing.security as Record<string, unknown>) ?? {};
    const merged = { ...prevSecurity, ...pinFields };

    const user = await prisma.user.update({ where: { id: req.params.id }, data: { security: merged } });
    res.json(toUserDTO(user));
  })
);

const setBiometricSchema = z.object({ enabled: z.boolean(), credentialId: z.string().optional() });

// Mobile uses expo-local-authentication (OS-native Face ID/fingerprint prompt gating the
// device's SecureStore-held refresh token) rather than WebAuthn, so there's no credential
// challenge/response to verify server-side — this just persists the on/off flag for UI state.
usersRouter.post(
  '/:id/security/biometric',
  asyncHandler(async (req, res) => {
    const { enabled, credentialId } = setBiometricSchema.parse(req.body);
    const isSelf = req.params.id === req.user!.id;
    if (!isSelf) throw new HttpError(403, 'Can only set your own biometric login');

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('User not found');

    const biometricFields = enabled
      ? { biometricEnabled: true, biometricCredentialId: credentialId ?? null }
      : { biometricEnabled: false, biometricCredentialId: null };
    const prevSecurity = (existing.security as Record<string, unknown>) ?? {};
    const merged = { ...prevSecurity, ...biometricFields };

    const user = await prisma.user.update({ where: { id: req.params.id }, data: { security: merged } });
    res.json(toUserDTO(user));
  })
);

// Save a user's own UI preferences (e.g. the drag-to-reorder Dashboard layout). Self only, so
// nobody can rearrange another user's screen. Merged onto existing prefs so unrelated keys survive.
const orderPair = z
  .object({
    tiles: z.array(z.string()).optional(),
    sections: z.array(z.string()).optional(),
  })
  .optional();
const preferencesSchema = z.object({
  dashboard: orderPair,
  menuOrder: z.array(z.string()).optional(),
  mobileMenuOrder: z.array(z.string()).optional(),
  mobileDashboard: orderPair,
});

usersRouter.patch(
  '/:id/preferences',
  asyncHandler(async (req, res) => {
    if (req.params.id !== req.user!.id) throw new HttpError(403, 'Can only change your own preferences');
    const input = preferencesSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('User not found');

    const prev = (existing.preferences as Record<string, unknown>) ?? {};
    const merged = { ...prev, ...input };
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { preferences: merged } });
    res.json(toUserDTO(user));
  })
);
