import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toPaymentDTO } from '../../lib/serializeTransactions';
import { allocateFifo, unpaidInvoicesForParty } from '../../lib/fifoAllocation';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

paymentsRouter.get(
  '/',
  requirePermission('view_payments'),
  asyncHandler(async (req, res) => {
    const { fy, partyId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.payment.findMany({
      where: { ...(fy ? { financialYear: fy } : {}), ...(partyId ? { partyId } : {}) },
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

const paymentSchema = z.object({
  date: z.string().min(1),
  partyId: z.string().uuid(),
  dir: z.enum(['in', 'out']),
  amount: z.coerce.number().positive(),
  mode: z.enum(['Cash', 'HDFC CRAC', 'ICICI CRAC', 'ICICI CCAC', 'KCBL CRAC']),
  note: z.string().nullable().optional(),
  // Invoice IDs the user selected to allocate against, in priority order (normally oldest-first).
  // Only meaningful when dir='in'; unallocated amount goes to the party's general balance.
  outwardIds: z.array(z.string().uuid()).optional(),
});

paymentsRouter.post(
  '/',
  requirePermission('record_payments'),
  asyncHandler(async (req, res) => {
    const input = paymentSchema.parse(req.body);

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          date: new Date(input.date),
          partyId: input.partyId,
          dir: input.dir,
          amount: input.amount,
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

        const allocations = allocateFifo(input.amount, selected);
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

      return tx.payment.findUniqueOrThrow({
        where: { id: created.id },
        include: { paymentAllocations: true },
      });
    });

    res.status(201).json(toPaymentDTO(payment));
  })
);

paymentsRouter.delete(
  '/:id',
  requirePermission('record_payments'),
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
