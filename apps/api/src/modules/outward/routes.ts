import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { toOutwardDTO } from '../../lib/serializeTransactions';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { ForbiddenError, NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';
import { logActivity } from '../../lib/audit';
import { notifyActivity } from '../../lib/notify';
import { fyDateWhere } from '../../lib/fyFilter';

export const outwardRouter = Router();
outwardRouter.use(authenticate);

const outwardSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().uuid(),
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number(),
  freightRate: z.coerce.number().default(0),
  gstPct: z.coerce.number().default(0),
  handlingRate: z.coerce.number().default(0),
  handlingAgentId: z.string().uuid().nullable().optional(),
  payStatus: z.enum(['pending', 'received', 'credit']).default('pending'),
  creditDays: z.coerce.number().int().default(0),
  invNo: z.string().nullable().optional(),
  invDate: z.string().nullable().optional(),
  transporterId: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
  // Normally a new sale starts as 'pending'. Importing historical invoices is the exception:
  // those already happened, and forcing them through the pending list would mean marking several
  // hundred of them delivered by hand.
  fulfil: z.enum(['pending', 'dispatched', 'delivered']).optional(),
});

outwardRouter.get(
  '/',
  requirePermission('view_outward'),
  asyncHandler(async (req, res) => {
    const { fy, partyId, itemId, fulfil } = req.query as Record<string, string | undefined>;
    const rows = await prisma.outward.findMany({
      where: {
        ...fyDateWhere(fy),
        ...(partyId ? { partyId } : {}),
        ...(itemId ? { itemId } : {}),
        ...(fulfil ? { fulfil } : {}),
      },
      orderBy: { date: 'desc' },
    });
    res.json(rows.map(toOutwardDTO));
  })
);

// Manual outward (the "Outward" tab) — unlike Place Order, freight/handling post immediately.
outwardRouter.post(
  '/',
  requirePermission('add_outward'),
  asyncHandler(async (req, res) => {
    const input = outwardSchema.parse(req.body);
    const freight = Math.round(input.freightRate * input.qty * 100) / 100;
    const gst = Math.round(input.qty * input.rate * (input.gstPct / 100) * 100) / 100;
    const handling = Math.round(input.handlingRate * (input.qty / 1000) * 100) / 100;
    const amount = Math.round((input.qty * input.rate + gst) * 100) / 100;

    if (handling > 0 && !input.handlingAgentId) {
      throw new NotFoundError('Select a handling agent for the handling charges');
    }

    const created = await prisma.$transaction(async (tx) => {
      const outward = await tx.outward.create({
        data: {
          date: new Date(input.date),
          partyId: input.partyId,
          itemId: input.itemId,
          qty: input.qty,
          rate: input.rate,
          freightRate: input.freightRate,
          freight,
          gstPct: input.gstPct,
          gst,
          handlingRate: input.handlingRate,
          handling,
          handlingAgentId: input.handlingAgentId || null,
          amount,
          payStatus: input.payStatus,
          creditDays: input.creditDays,
          invNo: input.invNo || null,
          invDate: input.invDate ? new Date(input.invDate) : null,
          deliveryType: null,
          transporterId: input.transporterId || null,
          fulfil: input.fulfil ?? 'pending',
          note: input.note || null,
          createdById: req.user!.id,
        },
      });

      if (input.transporterId && freight > 0) {
        await tx.freightEntry.create({
          data: {
            date: outward.date,
            transporterId: input.transporterId,
            partyId: input.partyId,
            itemId: input.itemId,
            qty: input.qty,
            freight,
            freightRate: input.freightRate,
            outwardId: outward.id,
            invNo: input.invNo || null,
          },
        });
      }
      if (input.handlingAgentId && handling > 0) {
        await tx.handlingEntry.create({
          data: {
            date: outward.date,
            handlingAgentId: input.handlingAgentId,
            partyId: input.partyId,
            itemId: input.itemId,
            qty: input.qty,
            amount: handling,
            handlingRate: input.handlingRate,
            sourceId: outward.id,
            sourceKind: 'outward',
            invNo: input.invNo || null,
          },
        });
      }

      return outward;
    });

    const [op, oi] = await Promise.all([
      prisma.party.findUnique({ where: { id: input.partyId }, select: { name: true } }),
      prisma.item.findUnique({ where: { id: input.itemId }, select: { name: true } }),
    ]);
    await logActivity(prisma, req.user!, 'create', 'outward', created.id,
      `Sale (outward): ${op?.name ?? 'party'} · ${oi?.name ?? 'item'} · ${input.qty} · ₹${amount.toLocaleString('en-IN')}`);
    await notifyActivity(prisma, req.user!, 'outward', 'New Outward entry',
      `${req.user!.name} added Outward: ${op?.name ?? 'party'} · ${oi?.name ?? 'item'} · ${input.qty} · ₹${amount.toLocaleString('en-IN')}`);
    res.status(201).json(toOutwardDTO(created));
  })
);

const editOutwardSchema = z.object({
  date: z.string().optional(),
  invNo: z.string().nullable().optional(),
  invDate: z.string().nullable().optional(),
  partyId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  qty: z.coerce.number().positive().optional(),
  rate: z.coerce.number().optional(),
  gstPct: z.coerce.number().optional(),
  payStatus: z.enum(['pending', 'received', 'credit']).optional(),
  creditDays: z.coerce.number().int().optional(),
  note: z.string().nullable().optional(),
  // Freight and handling post entries into the transporter's and agent's ledgers, so changing
  // them means re-posting those entries — see below. Guarded by edit_outward_freight.
  freightRate: z.coerce.number().optional(),
  transporterId: z.string().uuid().nullable().optional(),
  handlingRate: z.coerce.number().optional(),
  handlingAgentId: z.string().uuid().nullable().optional(),
});

outwardRouter.patch(
  '/:id',
  requirePermission('edit_outward'),
  asyncHandler(async (req, res) => {
    const input = editOutwardSchema.parse(req.body);
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Outward entry not found');

    const touchesFreight =
      input.freightRate !== undefined ||
      input.transporterId !== undefined ||
      input.handlingRate !== undefined ||
      input.handlingAgentId !== undefined;
    if (touchesFreight && !hasPermission(req.user!.role, req.user!.permissions, 'edit_outward_freight')) {
      throw new ForbiddenError('Missing permission: edit_outward_freight');
    }

    const qty = input.qty ?? Number(existing.qty);
    const rate = input.rate ?? Number(existing.rate);
    const gstPct = input.gstPct ?? Number(existing.gstPct);
    const gst = Math.round(qty * rate * (gstPct / 100) * 100) / 100;
    const amount = Math.round((qty * rate + gst) * 100) / 100;

    // Freight is per unit and handling per tonne, so BOTH depend on qty — they have to be
    // recomputed whenever qty changes, not only when the rates are edited.
    const freightRate = input.freightRate ?? Number(existing.freightRate);
    const handlingRate = input.handlingRate ?? Number(existing.handlingRate);
    const transporterId = input.transporterId !== undefined ? input.transporterId : existing.transporterId;
    const handlingAgentId = input.handlingAgentId !== undefined ? input.handlingAgentId : existing.handlingAgentId;
    const freight = transporterId ? Math.round(freightRate * qty * 100) / 100 : 0;
    const handling = handlingAgentId ? Math.round(handlingRate * (qty / 1000) * 100) / 100 : 0;

    const changes = {
      ...input,
      date: input.date ? new Date(input.date) : undefined,
      invDate: input.invDate ? new Date(input.invDate) : undefined,
      qty,
      rate,
      gstPct,
      gst,
      amount,
      freightRate,
      freight,
      transporterId,
      handlingRate,
      handling,
      handlingAgentId,
    };

    const partyId = input.partyId ?? existing.partyId;
    const itemId = input.itemId ?? existing.itemId;
    const date = changes.date ?? existing.date;
    const invNo = input.invNo !== undefined ? input.invNo : existing.invNo;

    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'edit',
      target: 'outward',
      targetId: existing.id,
      payload: { id: existing.id, changes },
      label: `Edit Outward: qty ${qty}, amount ${amount}`,
      // The freight and handling entries are what the transporter and agent are actually paid
      // from. Updating the order without re-posting them would leave their ledgers stating the
      // old figures, so both are cleared and rebuilt inside one transaction.
      execute: () =>
        prisma.$transaction(async (tx) => {
          const updated = await tx.outward.update({ where: { id: existing.id }, data: changes });
          await tx.freightEntry.deleteMany({ where: { outwardId: existing.id } });
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward', sourceId: existing.id } });
          if (transporterId && freight > 0) {
            await tx.freightEntry.create({
              data: { date, transporterId, partyId, itemId, qty, freight, freightRate, outwardId: existing.id, invNo },
            });
          }
          if (handlingAgentId && handling > 0) {
            await tx.handlingEntry.create({
              data: {
                date,
                handlingAgentId,
                partyId,
                itemId,
                qty,
                amount: handling,
                handlingRate,
                sourceId: existing.id,
                sourceKind: 'outward',
                invNo,
              },
            });
          }
          return updated;
        }),
    });

    if (result.executed) res.json(toOutwardDTO(result.result!));
    else res.status(202).json({ queued: true });
  })
);

outwardRouter.delete(
  '/:id',
  requirePermission('delete_outward'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Outward entry not found');

    const label = `Outward: qty ${existing.qty}, amount ${existing.amount}`;
    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'delete',
      target: 'outward',
      targetId: existing.id,
      payload: { id: existing.id },
      label,
      execute: () =>
        prisma.$transaction(async (tx) => {
          // freightEntry cascades via FK, but handlingEntry references outward polymorphically
          // (sourceKind/sourceId, no FK) so it needs cleaning up manually.
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward', sourceId: existing.id } });
          await tx.outward.delete({ where: { id: existing.id } });
        }),
    });

    if (result.executed) res.status(204).end();
    else res.status(202).json({ queued: true });
  })
);
