import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { getRecentEventsFor } from '../../lib/notify';

export const pushRouter = Router();
pushRouter.use(authenticate);

// Recent notifiable events for the signed-in user, for the web/desktop app to show as native
// notifications while it is open (the phone gets a real push instead). Pass `since` (the timestamp
// of the last event already seen) to get only newer ones. Respects the user's notify opt-in and
// never returns their own actions.
pushRouter.get(
  '/recent',
  asyncHandler(async (req, res) => {
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { preferences: true } });
    res.json(getRecentEventsFor(req.user!.id, me?.preferences ?? null, since));
  })
);

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'ios']).optional(),
});

// Register (or refresh) the current device's push token for the signed-in user. Upserted on the
// unique token so re-logins and token refreshes don't create duplicates; if the token was
// previously tied to a different user (shared device), it moves to whoever is signed in now.
pushRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { token, platform } = registerSchema.parse(req.body);
    await prisma.pushToken.upsert({
      where: { token },
      create: { userId: req.user!.id, token, platform: platform ?? null },
      update: { userId: req.user!.id, platform: platform ?? null },
    });
    res.status(201).json({ ok: true });
  })
);

// Unregister a device token (called on sign-out) so a logged-out phone stops receiving pushes.
pushRouter.post(
  '/unregister',
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await prisma.pushToken.deleteMany({ where: { token, userId: req.user!.id } });
    res.json({ ok: true });
  })
);
