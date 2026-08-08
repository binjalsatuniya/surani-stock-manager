import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toOutwardDTO } from '../../lib/serializeTransactions';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { writeAuditLog, logActivity } from '../../lib/audit';
import { notifyActivity } from '../../lib/notify';
import { fyDateWhere } from '../../lib/fyFilter';

// Split into two routers so the mount paths in app.ts match the API design: POST /orders is
// top-level (matches the legacy "Place New Order" action), while list+dispatch/deliver/cancel/
// restore live under /orderbook.
export const ordersRouter = Router();
ordersRouter.use(authenticate);

export const orderbookRouter = Router();
orderbookRouter.use(authenticate);

const orderSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().uuid(),
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  rate: z.coerce.number(),
  gstPct: z.coerce.number().default(0),
  deliveryType: z.enum(['ExWorks', 'FOR']),
  invNo: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
});

// Place New Order — freight/handling are NOT posted now, only at dispatch (unlike manual outward).
ordersRouter.post(
  '/',
  requirePermission('place_order'),
  asyncHandler(async (req, res) => {
    const input = orderSchema.parse(req.body);
    const party = await prisma.party.findUnique({ where: { id: input.partyId } });
    if (!party) throw new NotFoundError('Party not found');

    const creditDays = party.creditDays;
    const payStatus = creditDays > 0 ? 'credit' : 'pending';
    const gst = Math.round(input.qty * input.rate * (input.gstPct / 100) * 100) / 100;
    const amount = Math.round((input.qty * input.rate + gst) * 100) / 100;

    const outward = await prisma.outward.create({
      data: {
        date: new Date(input.date),
        partyId: input.partyId,
        itemId: input.itemId,
        qty: input.qty,
        rate: input.rate,
        gstPct: input.gstPct,
        gst,
        amount,
        payStatus,
        creditDays,
        deliveryType: input.deliveryType,
        invNo: input.invNo || null,
        fulfil: 'pending',
        note: input.note || null,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        createdById: req.user!.id,
      },
    });
    const placeItem = await prisma.item.findUnique({ where: { id: input.itemId }, select: { name: true } });
    await logActivity(prisma, req.user!, 'place order', 'outward', outward.id,
      `Order placed: ${party.name} · ${placeItem?.name ?? 'item'} · ${input.qty} · ₹${amount.toLocaleString('en-IN')}`);
    await notifyActivity(prisma, req.user!, 'order_placed', 'New order placed',
      `${req.user!.name} placed an order: ${party.name} · ${placeItem?.name ?? 'item'} · ${input.qty} · ₹${amount.toLocaleString('en-IN')}`);
    res.status(201).json(toOutwardDTO(outward));
  })
);

orderbookRouter.get(
  '/',
  requirePermission('view_orderbook'),
  asyncHandler(async (req, res) => {
    const { fy, fulfil } = req.query as Record<string, string | undefined>;
    const rows = await prisma.outward.findMany({
      where: { ...fyDateWhere(fy), ...(fulfil ? { fulfil } : {}) },
      orderBy: { date: 'desc' },
      // Embed the names so the Order Book shows them even for users without Parties/Items access.
      include: {
        party: { select: { name: true } },
        item: { select: { name: true } },
        transporter: { select: { name: true } },
        handlingAgent: { select: { name: true } },
      },
    });
    // Strip the (potentially large) invoice blob from the list — the name stays so the UI knows an
    // invoice exists; the file itself is fetched on demand via GET /orderbook/:id/invoice.
    res.json(rows.map((r) => toOutwardDTO({ ...r, invoiceFile: null })));
  })
);

// Fetch the attached invoice file for one order — gated by view_invoice.
orderbookRouter.get(
  '/:id/invoice',
  requirePermission('view_invoice'),
  asyncHandler(async (req, res) => {
    const row = await prisma.outward.findUnique({
      where: { id: req.params.id },
      select: { invoiceFile: true, invoiceFileName: true },
    });
    if (!row) throw new NotFoundError('Order not found');
    res.json({ invoiceFile: row.invoiceFile, invoiceFileName: row.invoiceFileName });
  })
);

const dispatchSchema = z.object({
  invNo: z.string().min(1),
  invDate: z.string().min(1),
  transporterId: z.string().uuid().nullable().optional(),
  freightRate: z.coerce.number().default(0),
  handlingAgentId: z.string().uuid().nullable().optional(),
  handlingRate: z.coerce.number().default(0),
  vehicle: z.string().nullable().optional(),
  invoiceFile: z.string().nullable().optional(),
  invoiceFileName: z.string().nullable().optional(),
});

orderbookRouter.post(
  '/:id/dispatch',
  requirePermission('dispatch_order'),
  asyncHandler(async (req, res) => {
    const input = dispatchSchema.parse(req.body);
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Order not found');

    if (existing.deliveryType === 'FOR' && !input.transporterId) {
      throw new HttpError(400, 'Select a transporter — mandatory for FOR orders');
    }
    if (input.freightRate > 0 && !input.transporterId) {
      throw new HttpError(400, 'Select a transporter for freight charges');
    }
    if (input.handlingRate > 0 && !input.handlingAgentId) {
      throw new HttpError(400, 'Select a handling agent for handling charges');
    }

    const freight = input.transporterId ? Math.round(input.freightRate * Number(existing.qty) * 100) / 100 : 0;
    const handling = input.handlingAgentId
      ? Math.round(input.handlingRate * (Number(existing.qty) / 1000) * 100) / 100
      : 0;
    const deliveryType = existing.deliveryType || (input.freightRate > 0 ? 'FOR' : 'ExWorks');

    const updated = await prisma.$transaction(async (tx) => {
      // Remove any previously posted entries for this order (supports re-dispatch), then re-post.
      await tx.freightEntry.deleteMany({ where: { outwardId: existing.id } });
      await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward', sourceId: existing.id } });

      const order = await tx.outward.update({
        where: { id: existing.id },
        data: {
          invNo: input.invNo,
          invDate: new Date(input.invDate),
          fulfil: 'dispatched',
          dispatchedAt: new Date(),
          transporterId: input.transporterId || null,
          vehicle: input.vehicle || null,
          // Only replace the invoice when a new file is sent; omitting it keeps the existing one.
          invoiceFile: input.invoiceFile === undefined ? existing.invoiceFile : input.invoiceFile || null,
          invoiceFileName: input.invoiceFileName === undefined ? existing.invoiceFileName : input.invoiceFileName || null,
          freightRate: input.freightRate,
          freight,
          handlingAgentId: input.handlingAgentId || null,
          handlingRate: input.handlingRate,
          handling,
          deliveryType,
        },
      });

      if (input.transporterId && freight > 0) {
        await tx.freightEntry.create({
          data: {
            date: order.invDate!,
            transporterId: input.transporterId,
            partyId: order.partyId,
            itemId: order.itemId,
            qty: order.qty,
            freight,
            freightRate: input.freightRate,
            outwardId: order.id,
            invNo: input.invNo,
          },
        });
      }
      if (input.handlingAgentId && handling > 0) {
        await tx.handlingEntry.create({
          data: {
            date: order.invDate!,
            handlingAgentId: input.handlingAgentId,
            partyId: order.partyId,
            itemId: order.itemId,
            qty: order.qty,
            amount: handling,
            handlingRate: input.handlingRate,
            sourceId: order.id,
            sourceKind: 'outward',
            invNo: input.invNo,
          },
        });
      }
      return order;
    });

    {
      const [dp, di] = await Promise.all([
        prisma.party.findUnique({ where: { id: existing.partyId }, select: { name: true } }),
        prisma.item.findUnique({ where: { id: existing.itemId }, select: { name: true } }),
      ]);
      await logActivity(prisma, req.user!, 'dispatch', 'outward', existing.id,
        `Order dispatched: ${dp?.name ?? 'party'} · ${di?.name ?? 'item'} · ${Number(existing.qty)}`);
      await notifyActivity(prisma, req.user!, 'order_dispatched', 'Order dispatched',
        `${req.user!.name} dispatched an order: ${dp?.name ?? 'party'} · ${di?.name ?? 'item'} · ${Number(existing.qty)}`);
    }
    res.json(toOutwardDTO(updated));
  })
);

orderbookRouter.post(
  '/:id/deliver',
  requirePermission('dispatch_order'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Order not found');

    // Delivery does NOT settle the payment. The amount stays due until an actual payment is
    // recorded. With 0 credit days the due date is the invoice/delivery date (payable same day —
    // 100% against delivery); with credit days it's invoice date + credit days.
    const updated = await prisma.outward.update({
      where: { id: existing.id },
      data: { fulfil: 'delivered', deliveredAt: new Date() },
    });
    {
      const [dp, di] = await Promise.all([
        prisma.party.findUnique({ where: { id: existing.partyId }, select: { name: true } }),
        prisma.item.findUnique({ where: { id: existing.itemId }, select: { name: true } }),
      ]);
      await logActivity(prisma, req.user!, 'deliver', 'outward', existing.id,
        `Order delivered: ${dp?.name ?? 'party'} · ${di?.name ?? 'item'} · ${Number(existing.qty)}`);
      await notifyActivity(prisma, req.user!, 'order_delivered', 'Order delivered',
        `${req.user!.name} delivered an order: ${dp?.name ?? 'party'} · ${di?.name ?? 'item'} · ${Number(existing.qty)}`);
    }
    res.json(toOutwardDTO(updated));
  })
);

orderbookRouter.post(
  '/:id/cancel',
  requireRole('superadmin', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Order not found');
    // A delivered order can only be cancelled by a Super Admin (it reverses a completed sale).
    if (existing.fulfil === 'delivered' && req.user!.role !== 'superadmin')
      throw new HttpError(400, 'Delivered orders can only be cancelled by a Super Admin');
    if (existing.fulfil === 'cancelled') throw new HttpError(400, 'Order is already cancelled');
    const cancelNote = (z.object({ note: z.string().optional() }).parse(req.body).note || '').trim() || null;

    const updated = await prisma.$transaction(async (tx) => {
      // Reverse any freight/handling ledger entries already posted (e.g. if it was dispatched).
      await tx.freightEntry.deleteMany({ where: { outwardId: existing.id } });
      await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward', sourceId: existing.id } });

      const order = await tx.outward.update({
        where: { id: existing.id },
        data: {
          prevFulfil: existing.fulfil,
          fulfil: 'cancelled',
          cancelledAt: new Date(),
          cancelledById: req.user!.id,
          cancelNote,
        },
      });
      await writeAuditLog(tx, {
        action: 'cancel',
        target: 'outward',
        targetId: order.id,
        label: `Order cancelled — qty ${order.qty}, amount ${order.amount}${cancelNote ? ` · reason: ${cancelNote}` : ''}`,
        actorId: req.user!.id,
        actorName: req.user!.name,
      });
      return order;
    });

    res.json(toOutwardDTO(updated));
  })
);

orderbookRouter.post(
  '/:id/restore',
  requireRole('superadmin', 'admin'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Order not found');
    if (existing.fulfil !== 'cancelled') throw new HttpError(400, 'Order is not cancelled');

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.outward.update({
        where: { id: existing.id },
        data: {
          fulfil: existing.prevFulfil || 'pending',
          prevFulfil: null,
          cancelledAt: null,
          cancelledById: null,
          cancelNote: null,
        },
      });
      await writeAuditLog(tx, {
        action: 'restore',
        target: 'outward',
        targetId: order.id,
        label: `Order restored — qty ${order.qty}, amount ${order.amount}`,
        actorId: req.user!.id,
        actorName: req.user!.name,
      });
      return order;
    });

    res.json(toOutwardDTO(updated));
  })
);

// pending -> dispatched or dispatched -> delivered are the forward actions above;
// these mirror the legacy "↶" undo buttons that step fulfil back without touching ledger entries.
orderbookRouter.post(
  '/:id/set-fulfil',
  requirePermission('dispatch_order'),
  asyncHandler(async (req, res) => {
    const status = z.enum(['pending', 'dispatched', 'delivered']).parse(req.body.status);
    const existing = await prisma.outward.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Order not found');

    const updated = await prisma.outward.update({
      where: { id: existing.id },
      data: {
        fulfil: status,
        deliveredAt: status === 'delivered' ? new Date() : null,
        ...(status === 'delivered' && existing.creditDays === 0 ? { payStatus: 'received' } : {}),
      },
    });
    res.json(toOutwardDTO(updated));
  })
);
