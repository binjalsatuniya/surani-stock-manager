import { Router } from 'express';
import { z } from 'zod';
import type { Trip as PrismaTrip } from '@prisma/client';
import type { Trip } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { NotFoundError } from '../../middleware/errorHandler';
import { logActivity } from '../../lib/audit';

export const tripsRouter = Router();
tripsRouter.use(authenticate);

function toTripDTO(t: PrismaTrip): Trip {
  return {
    id: t.id,
    name: t.name,
    note: t.note,
    closedAt: t.closedAt ? t.closedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

// Anyone who can see expenses can read the trip list (to pick one when entering an expense).
tripsRouter.get(
  '/',
  requirePermission('view_expenses'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.trip.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(rows.map(toTripDTO));
  })
);

const createSchema = z.object({ name: z.string().min(1), note: z.string().nullable().optional() });
tripsRouter.post(
  '/',
  requirePermission('manage_expense_trips'),
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const created = await prisma.trip.create({
      data: { name: input.name.trim(), note: input.note?.trim() || null, createdById: req.user!.id },
    });
    await logActivity(prisma, req.user!, 'create', 'trip', created.id, `Trip created: ${created.name}`);
    res.status(201).json(toTripDTO(created));
  })
);

// Close (mark paid) or reopen a trip.
const closeSchema = z.object({ closed: z.boolean() });
tripsRouter.patch(
  '/:id',
  requirePermission('manage_expense_trips'),
  asyncHandler(async (req, res) => {
    const { closed } = closeSchema.parse(req.body);
    const existing = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Trip not found');
    const updated = await prisma.trip.update({
      where: { id: existing.id },
      data: { closedAt: closed ? new Date() : null },
    });
    await logActivity(prisma, req.user!, closed ? 'close' : 'reopen', 'trip', existing.id,
      `Trip ${closed ? 'marked paid / closed' : 'reopened'}: ${existing.name}`);
    res.json(toTripDTO(updated));
  })
);

// Mark a whole trip paid: record HOW it was settled (mode + who paid), mark every unpaid expense
// on the trip as paid with those details, and close the trip — all in one transaction.
const paySchema = z.object({ paidBy: z.string().nullable().optional(), paidMode: z.string().nullable().optional() });
tripsRouter.post(
  '/:id/pay',
  requirePermission('manage_expense_trips'),
  asyncHandler(async (req, res) => {
    const { paidBy, paidMode } = paySchema.parse(req.body);
    const existing = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Trip not found');
    const now = new Date();
    await prisma.$transaction([
      prisma.salesPersonExpense.updateMany({
        where: { tripId: existing.id, paid: false },
        data: { paid: true, paidAt: now, paidBy: paidBy?.trim() || null, paidMode: paidMode || null },
      }),
      prisma.trip.update({ where: { id: existing.id }, data: { closedAt: now } }),
    ]);
    const updated = await prisma.trip.findUnique({ where: { id: existing.id } });
    await logActivity(prisma, req.user!, 'close', 'trip', existing.id,
      `Trip marked paid${paidMode ? ` (${paidMode})` : ''}: ${existing.name}`);
    res.json(toTripDTO(updated!));
  })
);

// Deleting a trip keeps its expenses (their trip tag is cleared via the FK's ON DELETE SET NULL).
tripsRouter.delete(
  '/:id',
  requirePermission('manage_expense_trips'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Trip not found');
    await prisma.trip.delete({ where: { id: existing.id } });
    await logActivity(prisma, req.user!, 'delete', 'trip', existing.id, `Trip deleted: ${existing.name}`);
    res.status(204).end();
  })
);
