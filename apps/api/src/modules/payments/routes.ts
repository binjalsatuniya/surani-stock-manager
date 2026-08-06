import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toPaymentDTO } from '../../lib/serializeTransactions';
import { allocateFifo, unpaidInvoicesForParty, unpaidPurchaseInvoicesForParty } from '../../lib/fifoAllocation';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';
import { logActivity } from '../../lib/audit';
import { notifyActivity } from '../../lib/notify';
import { fyDateWhere } from '../../lib/fyFilter';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

paymentsRouter.get(
  '/',
  requirePermission('view_payments'),
  asyncHandler(async (req, res) => {
    const { fy, partyId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.payment.findMany({
      where: { ...fyDateWhere(fy), ...(partyId ? { partyId } : {}) },
      include: { paymentAllocations: true },
      orderBy: { date: 'desc' },
    });
    res.json(rows.map(toPaymentDTO));
  })
);

paymentsRouter.get(
  '/unpaid-invoices',
  requirePermission('view_payments'),
  asyncHandler(async (req, res) => {
    const partyId = req.query.partyId as string | undefined;
    if (!partyId) throw new HttpError(400, 'partyId is required');
    res.json(await unpaidInvoicesForParty(partyId));
  })
);

// The payable-side equivalent: a creditor's outstanding purchase (inward) invoices, for allocating
// an outgoing payment (dir='out') against specific bills.
paymentsRouter.get(
  '/unpaid-purchase-invoices',
  requirePermission('view_payments'),
  asyncHandler(async (req, res) => {
    const partyId = req.query.partyId as string | undefined;
    if (!partyId) throw new HttpError(400, 'partyId is required');
    res.json(await unpaidPurchaseInvoicesForParty(partyId));
  })
);

const paymentSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().uuid(),
  dir: z.enum(['in', 'out']),
  amount: z.coerce.number().positive(), // cash that actually changed hands
  // TDS deducted at source. Invoices/ledger are settled by (amount + tdsAmount).
  tdsAmount: z.coerce.number().min(0).optional(),
  mode: z.enum(['Cash', 'HDFC CRAC', 'ICICI CRAC', 'ICICI CCAC', 'KCBL CRAC']),
  note: z.string().nullable().optional(),
  // Invoice IDs the user selected to allocate against, in priority order (normally oldest-first).
  // Only meaningful when dir='in'; unallocated amount goes to the party's general balance.
  outwardIds: z.array(z.string().uuid()).optional(),
  // The payable-side equivalent: purchase (inward) invoice IDs to allocate against. dir='out' only.
  inwardIds: z.array(z.string().uuid()).optional(),
});

paymentsRouter.post(
  '/',
  requirePermission('record_payments'),
  asyncHandler(async (req, res) => {
    const input = paymentSchema.parse(req.body);
    const tds = input.tdsAmount ?? 0;
    // The invoices/ledger are settled by the full value: cash received/paid PLUS any TDS.
    const settleAmount = input.amount + tds;

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          date: new Date(input.date),
          partyId: input.partyId,
          dir: input.dir,
          amount: input.amount,
          tdsAmount: tds,
          mode: input.mode,
          note: input.note || null,
          createdById: req.user!.id,
        },
      });

      if (input.dir === 'in' && input.outwardIds?.length) {
        const unpaid = await unpaidInvoicesForParty(input.partyId);
        const byId = new Map(unpaid.map((u) => [u.outwardId, u]));
        const selected = input.outwardIds
          .map((id) => byId.get(id))
          .filter((u): u is NonNullable<typeof u> => !!u)
          .map((u) => ({ outwardId: u.outwardId, balance: u.balance }));

        const allocations = allocateFifo(settleAmount, selected);
        for (const alloc of allocations) {
          await tx.paymentAllocation.create({
            data: { paymentId: created.id, outwardId: alloc.outwardId, amount: alloc.amount },
          });
        }

        // Mark fully-settled invoices as received (total allocated across all payments >= amount).
        for (const alloc of allocations) {
          const outward = await tx.outward.findUnique({
            where: { id: alloc.outwardId },
            include: { paymentAllocations: true },
          });
          if (!outward) continue;
          const totalAllocated = outward.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
          if (Math.abs(Number(outward.amount) - totalAllocated) < 0.01) {
            await tx.outward.update({ where: { id: outward.id }, data: { payStatus: 'received' } });
          }
        }
      }

      // Payable side: allocate an outgoing payment to specific purchase (inward) invoices. FIFO
      // across the selection; `allocateFifo` returns { outwardId } but here the id is the inward id.
      if (input.dir === 'out' && input.inwardIds?.length) {
        const unpaid = await unpaidPurchaseInvoicesForParty(input.partyId);
        const byId = new Map(unpaid.map((u) => [u.outwardId, u]));
        const selected = input.inwardIds
          .map((id) => byId.get(id))
          .filter((u): u is NonNullable<typeof u> => !!u)
          .map((u) => ({ outwardId: u.outwardId, balance: u.balance }));

        const allocations = allocateFifo(settleAmount, selected);
        for (const alloc of allocations) {
          await tx.paymentInwardAllocation.create({
            data: { paymentId: created.id, inwardId: alloc.outwardId, amount: alloc.amount },
          });
        }
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: { paymentAllocations: true },
      });
    });

    const payParty = await prisma.party.findUnique({ where: { id: input.partyId }, select: { name: true } });
    await logActivity(prisma, req.user!, 'create', 'payment', payment.id,
      `Payment ${input.dir === 'in' ? 'received' : 'paid'} ₹${input.amount.toLocaleString('en-IN')} — ${payParty?.name ?? 'party'}${tds ? ` (TDS ₹${tds.toLocaleString('en-IN')})` : ''} · ${input.mode}`);
    await notifyActivity(prisma, req.user!, 'payment', 'Payment recorded',
      `${req.user!.name} recorded a payment ${input.dir === 'in' ? 'received' : 'paid'} ₹${input.amount.toLocaleString('en-IN')} — ${payParty?.name ?? 'party'} · ${input.mode}`);
    res.status(201).json(toPaymentDTO(payment));
  })
);

paymentsRouter.delete(
  '/:id',
  requirePermission('delete_payments'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Payment not found');

    // Matches legacy delPayment(): does NOT reverse an invoice's payStatus back from 'received' —
    // a pre-existing quirk in the source app, not something to "fix" here.
    const result = await mutateOrQueue({
      user: req.user!,
      kind: 'delete',
      target: 'payment',
      targetId: existing.id,
      payload: { id: existing.id },
      label: `Payment: ${existing.dir === 'in' ? 'Received' : 'Paid'} ${existing.amount}`,
      execute: () => prisma.payment.delete({ where: { id: existing.id } }),
    });

    if (result.executed) res.status(204).end();
    else res.status(202).json({ queued: true });
  })
);
