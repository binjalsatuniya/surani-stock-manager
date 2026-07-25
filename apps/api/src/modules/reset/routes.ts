import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { ForbiddenError, HttpError, NotFoundError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../lib/audit';
import { exportAllData, wipeBusinessData } from '../../lib/backupData';

export const resetRouter = Router();
resetRouter.use(authenticate);

// A placeholder targetId for reset approval rows (the approvals table requires a uuid).
const RESET_TARGET_ID = '00000000-0000-0000-0000-000000000000';

function assertPrimary(req: { user?: { isPrimary?: boolean } }) {
  if (!req.user?.isPrimary) throw new ForbiddenError('Only the main Super Admin can do this');
}

// The dedicated "reset password" hash lives in the primary user's security JSON (no schema change).
async function getResetHash(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { security: true } });
  const s = (u?.security as Record<string, unknown>) ?? {};
  return (s.resetPasswordHash as string | null) ?? null;
}

// Find whichever user is the primary Super Admin (the one whose reset password gates everything).
async function primaryUser() {
  return prisma.user.findFirst({ where: { isPrimary: true } });
}

async function verifyResetPassword(password: string) {
  const primary = await primaryUser();
  if (!primary) throw new HttpError(400, 'No primary Super Admin is configured');
  const s = (primary.security as Record<string, unknown>) ?? {};
  const hash = (s.resetPasswordHash as string | null) ?? null;
  if (!hash) throw new HttpError(400, 'No reset password is set — set one in Access Settings first');
  const ok = password ? await bcrypt.compare(password, hash) : false;
  if (!ok) throw new HttpError(403, 'Incorrect reset password');
}

// Snapshot everything, wipe all business data, and leave a single audit entry recording the reset.
// Returns the pre-wipe snapshot so the caller can hand the user a downloadable backup.
async function performReset(actor: { id: string; name: string }, note: string) {
  return prisma.$transaction(async (tx) => {
    const snapshot = await exportAllData(tx);
    await wipeBusinessData(tx);
    // Written AFTER the wipe (which clears audit_log) so this record survives as the only trace.
    await writeAuditLog(tx, {
      action: 'reset',
      target: 'all',
      targetId: RESET_TARGET_ID,
      label: `ALL business data reset — ${note}`,
      details: { at: new Date().toISOString() },
      actorId: actor.id,
      actorName: actor.name,
    });
    return { version: 2, exportedAt: new Date().toISOString(), db: snapshot };
  });
}

// Whether a reset password is currently set (primary only — governs the UI prompt vs setup).
resetRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    res.json({ enabled: (await getResetHash(req.user!.id)) !== null });
  })
);

// Set / change / remove the dedicated reset password. Changing or removing needs the current one.
const passwordSchema = z.object({ current: z.string().optional(), next: z.string() });
resetRouter.post(
  '/password',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { current, next } = passwordSchema.parse(req.body);
    const existing = await getResetHash(req.user!.id);
    if (existing) {
      const ok = current ? await bcrypt.compare(current, existing) : false;
      if (!ok) throw new HttpError(403, 'Current reset password is incorrect');
    }
    if (next && next.length < 6) throw new HttpError(400, 'Reset password must be at least 6 characters');

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const prev = (user?.security as Record<string, unknown>) ?? {};
    const merged = { ...prev, resetPasswordHash: next ? await bcrypt.hash(next, 12) : null };
    await prisma.user.update({ where: { id: req.user!.id }, data: { security: merged } });
    res.json({ enabled: !!next });
  })
);

// JAYNIL (primary) resets directly. Verifies the reset password, then wipes + returns the backup.
const executeSchema = z.object({ password: z.string() });
resetRouter.post(
  '/execute',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { password } = executeSchema.parse(req.body);
    await verifyResetPassword(password);
    const backup = await performReset({ id: req.user!.id, name: req.user!.name }, `by ${req.user!.name}`);
    res.json({ ok: true, backup });
  })
);

// A non-primary admin can only REQUEST a reset — it queues for JAYNIL's approval, no deletion yet.
resetRouter.post(
  '/request',
  requireRole('superadmin', 'admin'),
  asyncHandler(async (req, res) => {
    if (req.user!.isPrimary) throw new HttpError(400, 'You can reset directly — no request needed');
    const existing = await prisma.approvalRequest.findFirst({ where: { kind: 'reset', status: 'pending' } });
    if (existing) throw new HttpError(400, 'A reset request is already pending approval');
    await prisma.approvalRequest.create({
      data: {
        kind: 'reset',
        target: 'all',
        targetId: RESET_TARGET_ID,
        payload: {},
        label: 'Reset ALL business data',
        requestedById: req.user!.id,
      },
    });
    res.status(201).json({ queued: true });
  })
);

// JAYNIL approves a pending reset request — requires the reset password, then wipes + returns backup.
resetRouter.post(
  '/approve/:id',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { password } = executeSchema.parse(req.body);
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
    if (!request || request.kind !== 'reset') throw new NotFoundError('Reset request not found');
    if (request.status !== 'pending') throw new HttpError(400, 'Request already resolved');
    await verifyResetPassword(password);
    // wipeBusinessData clears approval_requests too, so the row is gone after — that's the intent.
    const backup = await performReset(
      { id: req.user!.id, name: req.user!.name },
      `approved by ${req.user!.name} (requested #${request.id.slice(0, 8)})`
    );
    res.json({ ok: true, backup });
  })
);
