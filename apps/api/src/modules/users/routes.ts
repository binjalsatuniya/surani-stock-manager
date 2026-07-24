import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { defaultPermsForRole, type Role } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { toUserDTO } from '../../lib/serialize';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';

export const usersRouter = Router();
usersRouter.use(authenticate);

const roleEnum = z.enum(['superadmin', 'admin', 'account', 'staff']);

const createSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(4),
  role: roleEnum,
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
    // The Super Admin is the protected default — no one else can be created with, or promoted to,
    // that role (so nobody can be made as powerful as the Super Admin).
    if (input.role === 'superadmin') throw new HttpError(403, 'The Super Admin role cannot be assigned to other users');
    const existing = await prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new HttpError(409, 'Username already exists');

    const passwordHash = await bcrypt.hash(input.password, 12);
    const permissions = input.permissions ?? defaultPermsForRole(input.role as Role);
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
    res.status(201).json(toUserDTO(user));
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  role: roleEnum.optional(),
  permissions: z.record(z.boolean()).optional(),
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

    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json(toUserDTO(user));
  })
);

usersRouter.delete(
  '/:id',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw new NotFoundError('User not found');
    if (target.isPrimary) throw new HttpError(403, 'The main Super Admin account cannot be deleted');
    if (req.params.id === req.user!.id) throw new HttpError(400, 'Cannot delete your own account');
    // Removing another Super Admin is reserved for the main Super Admin.
    if (target.role === 'superadmin' && !req.user!.isPrimary)
      throw new HttpError(403, 'Only the main Super Admin can remove another Super Admin');
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).end();
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
const preferencesSchema = z.object({
  dashboard: z
    .object({
      tiles: z.array(z.string()).optional(),
      sections: z.array(z.string()).optional(),
    })
    .optional(),
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
