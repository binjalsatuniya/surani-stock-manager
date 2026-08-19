import { Router } from 'express';
import { z } from 'zod';
import type { SalesPersonExpense as PrismaExpense } from '@prisma/client';
import type { SalesPersonExpense } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { ForbiddenError, HttpError, NotFoundError } from '../../middleware/errorHandler';
import { addDays } from '../../lib/dateMath';
import { logActivity } from '../../lib/audit';
import { notifyActivity } from '../../lib/notify';

export const expensesRouter = Router();
expensesRouter.use(authenticate);

// Today's date in the business timezone (Asia/Kolkata), as YYYY-MM-DD. Using IST rather than the
// server's UTC clock means the "no old expenses" cutoff flips over at local midnight, not at 05:30.
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// The back-dating rule lives in the primary user's security JSON (no schema change). `null` means
// no limit; a number N means an expense may be dated at most N days before today (0 = today only).
async function getBackdateDays(): Promise<number | null> {
  const primary = await prisma.user.findFirst({ where: { isPrimary: true }, select: { security: true } });
  const s = (primary?.security as Record<string, unknown>) ?? {};
  const v = s.expenseBackdateDays;
  return typeof v === 'number' ? v : null;
}

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
    paidBy: e.paidBy,
    paidMode: e.paidMode,
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

// Read the back-dating rule (everyone, so their form can enforce it) — { backdateDays, today }.
expensesRouter.get(
  '/rule',
  asyncHandler(async (_req, res) => {
    res.json({ backdateDays: await getBackdateDays(), today: istToday() });
  })
);

// Set the rule (primary only). null clears the limit; a number sets the max days an expense may be
// back-dated (0 = today only).
const ruleSchema = z.object({ backdateDays: z.number().int().min(0).max(3650).nullable() });
expensesRouter.patch(
  '/rule',
  asyncHandler(async (req, res) => {
    if (!req.user!.isPrimary) throw new ForbiddenError('Only the main Super Admin can set the expense rule');
    const { backdateDays } = ruleSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const prev = (user?.security as Record<string, unknown>) ?? {};
    const merged = { ...prev, expenseBackdateDays: backdateDays };
    await prisma.user.update({ where: { id: req.user!.id }, data: { security: merged } });
    res.json({ backdateDays, today: istToday() });
  })
);

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
  requirePermission('add_expenses'),
  asyncHandler(async (req, res) => {
    const input = expenseSchema.parse(req.body);

    // Enforce the "no old expenses" rule (timezone-aware). Future dates aren't allowed either.
    const backdateDays = await getBackdateDays();
    const today = istToday();
    if (input.date > today) throw new HttpError(400, "Expense date can't be in the future.");
    if (backdateDays !== null) {
      const earliest = addDays(today, -backdateDays);
      if (input.date < earliest) {
        throw new HttpError(
          400,
          backdateDays === 0
            ? 'Only today’s expenses can be added. Older dates are not allowed.'
            : `Expenses can be dated at most ${backdateDays} day(s) back (not before ${earliest}).`
        );
      }
    }

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
    await logActivity(prisma, req.user!, 'create', 'expense', created.id,
      `Expense added: ₹${input.amount.toLocaleString('en-IN')} · ${input.expenseFor}`);
    await notifyActivity(prisma, req.user!, 'expense', 'New expense added',
      `${req.user!.name} added an expense: ₹${input.amount.toLocaleString('en-IN')} · ${input.expenseFor}`);
    res.status(201).json(toExpenseDTO(created));
  })
);

// Mark an expense paid/unpaid (reimbursed to the sales person). When paid, records who paid it and
// by which payment mode; unpaid clears all of that.
const paidSchema = z.object({
  paid: z.boolean(),
  paidBy: z.string().nullable().optional(),
  paidMode: z.string().nullable().optional(),
});
expensesRouter.patch(
  '/:id/paid',
  requirePermission('edit_expenses'),
  asyncHandler(async (req, res) => {
    const { paid, paidBy, paidMode } = paidSchema.parse(req.body);
    const existing = await prisma.salesPersonExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Expense not found');
    const updated = await prisma.salesPersonExpense.update({
      where: { id: existing.id },
      data: paid
        ? { paid: true, paidAt: new Date(), paidBy: paidBy || null, paidMode: paidMode || null }
        : { paid: false, paidAt: null, paidBy: null, paidMode: null },
    });
    await logActivity(prisma, req.user!, paid ? 'mark paid' : 'mark unpaid', 'expense', existing.id,
      `Expense marked ${paid ? 'paid' : 'unpaid'}: ₹${Number(existing.amount).toLocaleString('en-IN')}`);
    res.json(toExpenseDTO(updated));
  })
);

// Edit an expense's details (date, sales person, amount, what it was for, attachment). Gated by
// edit_expenses. The back-dating rule is only enforced when the date is actually being changed, so
// correcting the amount of an old expense is never blocked by it.
const editExpenseSchema = z.object({
  salesPersonId: z.string().uuid().optional(),
  date: z.string().min(1).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  expenseFor: z.string().min(1).optional(),
  attachment: z.string().max(7_000_000).nullable().optional(),
  attachmentName: z.string().nullable().optional(),
});
expensesRouter.patch(
  '/:id',
  requirePermission('edit_expenses'),
  asyncHandler(async (req, res) => {
    const input = editExpenseSchema.parse(req.body);
    const existing = await prisma.salesPersonExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Expense not found');

    const existingDate = existing.date.toISOString().slice(0, 10);
    if (input.date !== undefined && input.date !== existingDate) {
      const backdateDays = await getBackdateDays();
      const today = istToday();
      if (input.date > today) throw new HttpError(400, "Expense date can't be in the future.");
      if (backdateDays !== null) {
        const earliest = addDays(today, -backdateDays);
        if (input.date < earliest) {
          throw new HttpError(
            400,
            backdateDays === 0
              ? 'Only today’s date is allowed by the expense date rule.'
              : `An expense can be dated at most ${backdateDays} day(s) back (not before ${earliest}).`
          );
        }
      }
    }

    const updated = await prisma.salesPersonExpense.update({
      where: { id: existing.id },
      data: {
        ...(input.salesPersonId !== undefined ? { salesPersonId: input.salesPersonId } : {}),
        ...(input.date !== undefined ? { date: new Date(input.date) } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.expenseFor !== undefined ? { expenseFor: input.expenseFor } : {}),
        ...(input.attachment !== undefined ? { attachment: input.attachment || null } : {}),
        ...(input.attachmentName !== undefined ? { attachmentName: input.attachmentName || null } : {}),
      },
    });
    await logActivity(prisma, req.user!, 'edit', 'expense', existing.id,
      `Expense edited: ₹${Number(updated.amount).toLocaleString('en-IN')} · ${updated.expenseFor}`);
    res.json(toExpenseDTO(updated));
  })
);

expensesRouter.delete(
  '/:id',
  requirePermission('delete_expenses'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.salesPersonExpense.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Expense not found');
    await prisma.salesPersonExpense.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);
