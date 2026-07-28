import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toItemDTO } from '../../lib/serializeMasters';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';
import { logActivity } from '../../lib/audit';

export const itemsRouter = Router();
itemsRouter.use(authenticate);

const unitEnum = z.enum(['KG', 'MT', 'pcs']);

const itemSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  unit: unitEnum,
  code: z.string().nullable().optional(),
  gstPct: z.coerce.number().default(0),
  rate: z.coerce.number().default(0),
  opening: z.coerce.number().default(0),
  reorder: z.coerce.number().default(0),
  rateDate: z.string().nullable().optional(),
});

itemsRouter.get(
  '/',
  requirePermission('view_items'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.item.findMany({ orderBy: { name: 'asc' } });
    res.json(items.map(toItemDTO));
  })
);

// Live stock = opening qty + sum(inward.qty) - sum(outward.qty, excluding cancelled).
itemsRouter.get(
  '/stock',
  requirePermission('view_items'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.item.findMany();
    const inwardTotals = await prisma.inward.groupBy({ by: ['itemId'], where: { status: 'received' }, _sum: { qty: true } });
    const outwardTotals = await prisma.outward.groupBy({
      by: ['itemId'],
      where: { fulfil: { not: 'cancelled' } },
      _sum: { qty: true },
    });
    const inMap = new Map(inwardTotals.map((r) => [r.itemId, Number(r._sum.qty ?? 0)]));
    const outMap = new Map(outwardTotals.map((r) => [r.itemId, Number(r._sum.qty ?? 0)]));
    res.json(
      items.map((i) => ({
        itemId: i.id,
        qty: Number(i.opening) + (inMap.get(i.id) ?? 0) - (outMap.get(i.id) ?? 0),
      }))
    );
  })
);

itemsRouter.post(
  '/',
  requirePermission('add_items'),
  asyncHandler(async (req, res) => {
    const input = itemSchema.parse(req.body);
    const item = await prisma.item.create({
      data: { ...input, rateDate: input.rateDate ? new Date(input.rateDate) : null },
    });
    await logActivity(prisma, req.user!, 'create', 'item', item.id, `Item added: ${item.name}`);
    res.status(201).json(toItemDTO(item));
  })
);

itemsRouter.patch(
  '/:id',
  requirePermission('edit_items'),
  asyncHandler(async (req, res) => {
    const input = itemSchema.partial().parse(req.body);
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Item not found');
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: { ...input, rateDate: input.rateDate ? new Date(input.rateDate) : undefined },
    });
    res.json(toItemDTO(item));
  })
);

itemsRouter.delete(
  '/:id',
  requirePermission('delete_items'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.item.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Item not found');

    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'delete',
      target: 'item',
      targetId: existing.id,
      payload: { id: existing.id },
      label: `Item: ${existing.name}`,
      execute: () => prisma.item.delete({ where: { id: existing.id } }),
    });

    if (result.executed) res.status(204).end();
    else res.status(202).json({ queued: true });
  })
);
