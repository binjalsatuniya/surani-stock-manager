import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError } from '../../middleware/errorHandler';

export const loginLocationsRouter = Router();
loginLocationsRouter.use(authenticate);

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

// Only the MAIN (primary) Super Admin — JAYNIL — may view everyone's login locations.
loginLocationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user!.isPrimary) throw new ForbiddenError('Only the main Super Admin can view login locations');
    const rows = await prisma.loginLocation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { user: { select: { name: true, username: true } } },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.name ?? '',
        username: r.user?.username ?? '',
        latitude: r.latitude,
        longitude: r.longitude,
        accuracy: r.accuracy,
        createdAt: r.createdAt.toISOString(),
      }))
    );
  })
);
