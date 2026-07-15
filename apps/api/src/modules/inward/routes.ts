import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toInwardDTO } from '../../lib/serializeTransactions';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';

export const inwardRouter = Router();
inwardRouter.use(authenticate);

const inwardSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().uuid(),
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number(),
  gstPct: z.coerce.number().default(0),
  handlingRate: z.coerce.number().default(0),
  handlingAgentId: z.string().uuid().nullable().optional(),
  invNo: z.string().nullable().optional(),
  invDate: z.string().nullable().optional(),
  deliveryType: z.enum(['ExWorks', 'FOR']).nullable().optional(),
  transporterId: z.string().uuid().nullable().optional(),
  freightRate: z.coerce.number().default(0),
  vehicle: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

inwardRouter.get(
  '/',
  requirePermission('view_inward'),
  asyncHandler(async (req, res) => {
    const { fy, partyId, itemId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.inward.findMany({
      where: {
        ...(fy ? { financialYear: fy } : {}),
        ...(partyId ? { partyId } : {}),
        ...(itemId ? { itemId } : {}),
      },
      orderBy: { date: 'desc' },
    });
    res.json(rows.map(toInwardDTO));
  })
);

// Step 1 of the two-step inward: record the goods as a PENDING entry. Nothing is posted yet —
// stock does not count, and no handling/freight/creditor-due is created until it is marked as
// received (see POST /:id/mark). Invoice no./date + handling charges are captured at that step.
inwardRouter.post(
  '/',
  requirePermission('edit_inward'),
  asyncHandler(async (req, res) => {
    const input = inwardSchema.parse(req.body);
    const gst = Math.round(input.qty * input.rate * (input.gstPct / 100) * 100) / 100;
    const amount = Math.round((input.qty * input.rate + gst) * 100) / 100;

    const created = await prisma.inward.create({
      data: {
        date: new Date(input.date),
        status: 'pending',
        partyId: input.partyId,
        itemId: input.itemId,
        qty: input.qty,
        rate: input.rate,
        gstPct: input.gstPct,
        gst,
        handlingRate: input.handlingRate,
        handling: 0,
        handlingAgentId: input.handlingAgentId || null,
        amount,
        invNo: input.invNo || null,
        invDate: input.invDate ? new Date(input.invDate) : null,
        deliveryType: input.deliveryType || null,
        transporterId: input.transporterId || null,
        freightRate: input.freightRate,
        freight: 0,
        vehicle: input.vehicle || null,
        note: input.note || null,
        createdById: req.user!.id,
      },
    });

    res.status(201).json(toInwardDTO(created));
  })
);

// Step 2: "Mark as Inward" — capture the invoice no./date + handling charges, post the
// handling/freight ledger entries, and flip status to 'received' so it counts everywhere.
const markSchema = z.object({
  invNo: z.string().nullable().optional(),
  invDate: z.string().nullable().optional(),
  handlingAgentId: z.string().uuid().nullable().optional(),
  handlingRate: z.coerce.number().default(0),
});

inwardRouter.post(
  '/:id/mark',
  requirePermission('edit_inward'),
  asyncHandler(async (req, res) => {
    const input = markSchema.parse(req.body);
    const existing = await prisma.inward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Inward entry not found');

    const qty = Number(existing.qty);
    const handlingRate = input.handlingRate ?? Number(existing.handlingRate);
    const handlingAgentId = input.handlingAgentId !== undefined ? input.handlingAgentId : existing.handlingAgentId;
    const freightRate = Number(existing.freightRate);
    const deliveryType = existing.deliveryType;
    const invNo = input.invNo !== undefined ? input.invNo : existing.invNo;
    const invDate = input.invDate !== undefined ? (input.invDate ? new Date(input.invDate) : null) : existing.invDate;

    const handling = Math.round(handlingRate * (qty / 1000) * 100) / 100;
    const freight = deliveryType === 'FOR' ? Math.round(freightRate * qty * 100) / 100 : 0;

    if (handling > 0 && !handlingAgentId) {
      throw new NotFoundError('Select a handling agent for the handling charges');
    }
    if (deliveryType === 'FOR' && freight > 0 && !existing.transporterId) {
      throw new NotFoundError('Select a transporter for the freight charges');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.inward.update({
        where: { id: existing.id },
        data: { status: 'received', invNo: invNo || null, invDate, handlingRate, handling, handlingAgentId, freight },
      });
      // Re-post handling/freight ledger entries (idempotent: clear any prior ones first).
      await tx.handlingEntry.deleteMany({ where: { sourceKind: 'inward', sourceId: existing.id } });
      if (handlingAgentId && handling > 0) {
        await tx.handlingEntry.create({
          data: {
            date: existing.date, handlingAgentId, partyId: existing.partyId, itemId: existing.itemId,
            qty, amount: handling, handlingRate, sourceId: existing.id, sourceKind: 'inward', invNo: invNo || null,
          },
        });
      }
      await tx.freightEntry.deleteMany({ where: { inwardId: existing.id } });
      if (existing.transporterId && freight > 0) {
        await tx.freightEntry.create({
          data: {
            date: existing.date, transporterId: existing.transporterId, partyId: existing.partyId, itemId: existing.itemId,
            qty, freight, freightRate, inwardId: existing.id, invNo: invNo || null,
          },
        });
      }
      return row;
    });

    res.json(toInwardDTO(updated));
  })
);

// Full edit — all the fields from the Add form can be corrected here. Changing qty/rate/gst
// recomputes gst+amount; changing handling/freight/agent/transporter/delivery recomputes those
// charges AND re-syncs the linked handling/freight ledger entries (mirrors the create logic).
const editInwardSchema = z.object({
  date: z.string().optional(),
  invNo: z.string().nullable().optional(),
  invDate: z.string().nullable().optional(),
  partyId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
  qty: z.coerce.number().positive().optional(),
  rate: z.coerce.number().optional(),
  gstPct: z.coerce.number().optional(),
  handlingRate: z.coerce.number().optional(),
  handlingAgentId: z.string().uuid().nullable().optional(),
  deliveryType: z.enum(['ExWorks', 'FOR']).nullable().optional(),
  transporterId: z.string().uuid().nullable().optional(),
  freightRate: z.coerce.number().optional(),
  vehicle: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

inwardRouter.patch(
  '/:id',
  requirePermission('edit_inward'),
  asyncHandler(async (req, res) => {
    const input = editInwardSchema.parse(req.body);
    const existing = await prisma.inward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Inward entry not found');

    // Resolve each field to the new value (if provided) or fall back to the existing value.
    const partyId = input.partyId ?? existing.partyId;
    const itemId = input.itemId ?? existing.itemId;
    const qty = input.qty ?? Number(existing.qty);
    const rate = input.rate ?? Number(existing.rate);
    const gstPct = input.gstPct ?? Number(existing.gstPct);
    const handlingRate = input.handlingRate ?? Number(existing.handlingRate);
    const handlingAgentId = input.handlingAgentId !== undefined ? input.handlingAgentId : existing.handlingAgentId;
    const deliveryType = input.deliveryType !== undefined ? input.deliveryType : existing.deliveryType;
    const transporterId = input.transporterId !== undefined ? input.transporterId : existing.transporterId;
    const freightRate = input.freightRate ?? Number(existing.freightRate);
    const vehicle = input.vehicle !== undefined ? input.vehicle : existing.vehicle;
    const invNo = input.invNo !== undefined ? input.invNo : existing.invNo;

    const gst = Math.round(qty * rate * (gstPct / 100) * 100) / 100;
    const amount = Math.round((qty * rate + gst) * 100) / 100;
    const handling = Math.round(handlingRate * (qty / 1000) * 100) / 100;
    const freight = deliveryType === 'FOR' ? Math.round(freightRate * qty * 100) / 100 : 0;

    if (handling > 0 && !handlingAgentId) {
      throw new NotFoundError('Select a handling agent for the handling charges');
    }
    if (deliveryType === 'FOR' && freight > 0 && !transporterId) {
      throw new NotFoundError('Select a transporter for the freight charges');
    }

    const date = input.date ? new Date(input.date) : existing.date;
    const changes = {
      date,
      invNo,
      invDate: input.invDate !== undefined ? (input.invDate ? new Date(input.invDate) : null) : existing.invDate,
      partyId,
      itemId,
      qty,
      rate,
      gstPct,
      gst,
      amount,
      handlingRate,
      handling,
      handlingAgentId,
      deliveryType,
      transporterId,
      freightRate,
      freight,
      vehicle,
      note: input.note !== undefined ? input.note : existing.note,
    };

    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'edit',
      target: 'inward',
      targetId: existing.id,
      payload: { id: existing.id, changes },
      label: `Edit Inward: qty ${qty}, amount ${amount}`,
      execute: () =>
        prisma.$transaction(async (tx) => {
          const updated = await tx.inward.update({ where: { id: existing.id }, data: changes });
          // Re-sync the handling ledger entry for this inward.
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'inward', sourceId: existing.id } });
          if (handlingAgentId && handling > 0) {
            await tx.handlingEntry.create({
              data: {
                date, handlingAgentId, partyId, itemId, qty,
                amount: handling, handlingRate, sourceId: existing.id, sourceKind: 'inward', invNo: invNo || null,
              },
            });
          }
          // Re-sync the freight ledger entry for this inward.
          await tx.freightEntry.deleteMany({ where: { inwardId: existing.id } });
          if (transporterId && freight > 0) {
            await tx.freightEntry.create({
              data: {
                date, transporterId, partyId, itemId, qty,
                freight, freightRate, inwardId: existing.id, invNo: invNo || null,
              },
            });
          }
          return updated;
        }),
    });

    if (result.executed) res.json(toInwardDTO(result.result!));
    else res.status(202).json({ queued: true });
  })
);

inwardRouter.delete(
  '/:id',
  requirePermission('edit_inward'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.inward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Inward entry not found');

    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'delete',
      target: 'inward',
      targetId: existing.id,
      payload: { id: existing.id },
      label: `Inward: qty ${existing.qty}, amount ${existing.amount}`,
      execute: () =>
        prisma.$transaction(async (tx) => {
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'inward', sourceId: existing.id } });
          await tx.inward.delete({ where: { id: existing.id } });
        }),
    });

    if (result.executed) res.status(204).end();
    else res.status(202).json({ queued: true });
  })
);
