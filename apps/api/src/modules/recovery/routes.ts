import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError, HttpError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../lib/audit';

export const recoveryRouter = Router();

// The master recovery password (bcrypt) lives in the PRIMARY user's security JSON. It can reset any
// user's LOGIN password — but NOT the data-wipe reset password — so a leaked master password can't
// destroy data. No schema change.
async function getMasterHash(): Promise<string | null> {
  const primary = await prisma.user.findFirst({ where: { isPrimary: true }, select: { security: true } });
  const s = (primary?.security as Record<string, unknown>) ?? {};
  return (s.masterRecoveryHash as string | null) ?? null;
}

// -------- Brute-force guard for the PUBLIC endpoint (in-memory sliding window) --------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
let failures: number[] = [];
function lockedOut(): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  failures = failures.filter((t) => t > cutoff);
  return failures.length >= MAX_FAILURES;
}

// ===================== PUBLIC (pre-auth) — the user is locked out =====================
const recoverSchema = z.object({
  username: z.string().min(1),
  masterPassword: z.string().min(1),
  newPassword: z.string().min(4),
});
recoveryRouter.post(
  '/reset-login',
  asyncHandler(async (req, res) => {
    if (lockedOut()) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const { username, masterPassword, newPassword } = recoverSchema.parse(req.body);

    const hash = await getMasterHash();
    if (!hash) throw new HttpError(400, 'Master recovery password is not set up');

    const ok = await bcrypt.compare(masterPassword, hash);
    if (!ok) {
      failures.push(Date.now());
      throw new HttpError(403, 'Incorrect master recovery password');
    }

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) throw new HttpError(404, 'No user with that username');

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
      // Kill any existing sessions for that user so an old leaked token can't ride along.
      await tx.refreshToken.deleteMany({ where: { userId: target.id } });
      await writeAuditLog(tx, {
        action: 'password reset (master)',
        target: 'user',
        targetId: target.id,
        label: `Login password reset via master recovery for ${target.username}`,
        details: { username: target.username },
        actorId: null,
        actorName: 'Master Recovery',
      });
    });

    failures = []; // success clears the counter
    res.json({ ok: true });
  })
);

// ===================== Authenticated (primary only) — manage the master password =====================
recoveryRouter.use(authenticate);

function assertPrimary(req: { user?: { isPrimary?: boolean } }) {
  if (!req.user?.isPrimary) throw new ForbiddenError('Only the main Super Admin can do this');
}

recoveryRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    res.json({ enabled: (await getMasterHash()) !== null });
  })
);

const setSchema = z.object({ current: z.string().optional(), next: z.string() });
recoveryRouter.post(
  '/master-password',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { current, next } = setSchema.parse(req.body);
    const existing = await getMasterHash();
    if (existing) {
      const ok = current ? await bcrypt.compare(current, existing) : false;
      if (!ok) throw new HttpError(403, 'Current master password is incorrect');
    }
    if (next && next.length < 10) throw new HttpError(400, 'Master password must be at least 10 characters');

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const prev = (user?.security as Record<string, unknown>) ?? {};
    const merged = { ...prev, masterRecoveryHash: next ? await bcrypt.hash(next, 12) : null };
    await prisma.user.update({ where: { id: req.user!.id }, data: { security: merged } });
    res.json({ enabled: !!next });
  })
);
