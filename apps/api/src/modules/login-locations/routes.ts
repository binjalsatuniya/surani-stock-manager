import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError, HttpError } from '../../middleware/errorHandler';

export const loginLocationsRouter = Router();
loginLocationsRouter.use(authenticate);

// Only the main (primary) Super Admin may touch login locations at all.
function assertPrimary(req: { user?: { isPrimary?: boolean } }) {
  if (!req.user?.isPrimary) throw new ForbiddenError('Only the main Super Admin can view login locations');
}

// The bcrypt hash of the extra "access password" that gates viewing login locations lives in the
// primary user's security JSON (no schema change — same column as the PIN/biometric flags).
async function getAccessHash(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { security: true } });
  const security = (u?.security as Record<string, unknown>) ?? {};
  return (security.locationAccessHash as string | null) ?? null;
}

async function serializeLocations() {
  const rows = await prisma.loginLocation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { user: { select: { name: true, username: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user?.name ?? '',
    username: r.user?.username ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy: r.accuracy,
    createdAt: r.createdAt.toISOString(),
  }));
}

const locationSchema = z.object({
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  accuracy: z.coerce.number().nullable().optional(),
});

// Record the location captured at login for the current user.
loginLocationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = locationSchema.parse(req.body);
    const row = await prisma.loginLocation.create({
      data: {
        userId: req.user!.id,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracy: input.accuracy ?? null,
      },
    });
    res.status(201).json({ id: row.id });
  })
);

// Whether an access password is currently set (so the UI knows to prompt vs offer setup).
loginLocationsRouter.get(
  '/access-status',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    res.json({ enabled: (await getAccessHash(req.user!.id)) !== null });
  })
);

// Set / change / remove the access password. Changing or removing requires the current one, so
// someone who merely has the login can't reset the gate. `next` empty removes the protection.
const accessSchema = z.object({ current: z.string().optional(), next: z.string() });
loginLocationsRouter.post(
  '/access',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { current, next } = accessSchema.parse(req.body);
    const existingHash = await getAccessHash(req.user!.id);
    if (existingHash) {
      const ok = current ? await bcrypt.compare(current, existingHash) : false;
      if (!ok) throw new HttpError(403, 'Current access password is incorrect');
    }
    if (next && next.length < 4) throw new HttpError(400, 'Access password must be at least 4 characters');

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const prev = (user?.security as Record<string, unknown>) ?? {};
    const merged = { ...prev, locationAccessHash: next ? await bcrypt.hash(next, 12) : null };
    await prisma.user.update({ where: { id: req.user!.id }, data: { security: merged } });
    res.json({ enabled: !!next });
  })
);

// View the locations — protected. If an access password is set it MUST be supplied and correct;
// this is enforced server-side so it can't be bypassed by calling the API directly.
loginLocationsRouter.post(
  '/view',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    const { password } = z.object({ password: z.string().optional() }).parse(req.body);
    const hash = await getAccessHash(req.user!.id);
    if (hash) {
      const ok = password ? await bcrypt.compare(password, hash) : false;
      if (!ok) throw new HttpError(403, 'Incorrect access password');
    }
    res.json(await serializeLocations());
  })
);

// Legacy GET: still works ONLY when no access password is set. Once a password is configured it
// returns 403 so the (protected) POST /view path must be used.
loginLocationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    assertPrimary(req);
    if ((await getAccessHash(req.user!.id)) !== null) {
      throw new HttpError(403, 'Access password required — open with your access password');
    }
    res.json(await serializeLocations());
  })
);
