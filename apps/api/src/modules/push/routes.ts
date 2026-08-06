import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';

export const pushRouter = Router();
pushRouter.use(authenticate);

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
