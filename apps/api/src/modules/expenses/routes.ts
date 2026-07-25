import { Router } from 'express';
import { z } from 'zod';
import type { SalesPersonExpense as PrismaExpense } from '@prisma/client';
import type { SalesPersonExpense } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { NotFoundError } from '../../middleware/errorHandler';

export const expensesRouter = Router();
expensesRouter.use(authenticate);

function toExpenseDTO(e: PrismaExpense): SalesPersonExpense {
  return {
    id: e.id,
    salesPersonId: e.salesPersonId,
    date: e.date.toISOString().slice(0, 10),
    amount: Number(e.amount),
    expenseFor: e.expenseFor,
    attachment: e.attachment,
    attachmentName: e.attachmentName,
    paid: e.paid,
    paidAt: e.paidAt ? e.paidAt.toISOString() : null,
    createdAt: e.createdAt.toISOString(),
  };
}

const expenseSchema = z.object({
  salesPersonId: z.string().uuid(),
  date: z.string().min(1),
  amount: z.coerce.number().nonnegative(),
  expenseFor: z.string().min(1),
  // A data: URL (base64) of the attached invoice image/PDF, capped to keep the DB lean (~5MB encoded).
  attachment: z.string().max(7_000_000).nullable().optional(),
  attachmentName: z.string().nullable().optional(),
});

expensesRouter.get(
  '/',
  requirePermission('view_expenses'),
  asyncHandler(async (req, res) => {
    const { salesPersonId } = req.query as Record<string, string | undefined>;
    const validSp = z.string().uuid().safeParse(salesPersonId);
    const rows = await prisma.salesPersonExpense.findMany({
      where: { ...(validSp.success ? { salesPersonId: validSp.data } : {}) },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    res.json(rows.map(toExpenseDTO));
  })
);

expensesRouter.post(
  '/',
  requirePermission('edit_expenses'),
  asyncHandler(async (req, res) => {
    const input = expenseSchema.parse(req.body);
    const created = await prisma.salesPersonExpense.create({
      data: {
        salesPersonId: input.salesPersonId,
        date: new Date(input.date),
        amount: input.amount,
        expenseFor: input.expenseFor,
        attachment: input.attachment || null,
        attachmentName: input.attachmentName || null,
        createdById: req.user!.id,
      },
    });
    res.status(201).json(toExpenseDTO(created));
  })
);

// Mark an expense paid/unpaid (reimbursed to the sales person). Records/clears the paid date.
const paidSchema = z.object({ paid: z.boolean() });
expensesRouter.patch(
  '/:id/paid',
  requirePermission('edit_expenses'),
  asyncHandler(async (req, res) => {
    const { paid } = paidSchema.parse(req.body);
    const existing = await prisma.salesPersonExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Expense not found');
    const updated = await prisma.salesPersonExpense.update({
      where: { id: existing.id },
      data: { paid, paidAt: paid ? new Date() : null },
    });
    res.json(toExpenseDTO(updated));
  })
);

expensesRouter.delete(
  '/:id',
  requirePermission('edit_expenses'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.salesPersonExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Expense not found');
    await prisma.salesPersonExpense.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
