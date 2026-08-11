import { Router } from 'express';
import { z } from 'zod';
import { fyOfDate } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

export const financialYearsRouter = Router();
financialYearsRouter.use(authenticate);

// The set of financial years the user can pick from = every FY registered in the FinancialYear
// table, plus every FY that actually appears in the data, plus the current one — de-duped, newest first.
// FYs are derived from each row's `date` (via fyOfDate) rather than the stored `financial_year`
// column, which isn't populated on every environment — see lib/fyFilter.ts.
financialYearsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [registered, inwardDates, outwardDates, paymentDates] = await Promise.all([
      prisma.financialYear.findMany({ select: { label: true } }),
      prisma.inward.findMany({ distinct: ['date'], select: { date: true } }),
      prisma.outward.findMany({ distinct: ['date'], select: { date: true } }),
      prisma.payment.findMany({ distinct: ['date'], select: { date: true } }),
    ]);
    const set = new Set<string>();
    registered.forEach((r) => set.add(r.label));
    [...inwardDates, ...outwardDates, ...paymentDates].forEach((r) => {
      const fy = fyOfDate(r.date.toISOString());
      if (fy) set.add(fy);
    });
    const current = fyOfDate(new Date().toISOString());
    if (current) set.add(current);
    const labels = [...set].sort().reverse();
    res.json(labels);
  })
);

financialYearsRouter.post(
  '/',
  requirePermission('manage_financial_years'),
  asyncHandler(async (req, res) => {
    const { label } = z.object({ label: z.string().regex(/^\d{4}-\d{2}$/, 'Use format 2025-26') }).parse(req.body);
    const row = await prisma.financialYear.upsert({
      where: { label },
      create: { label, createdById: req.user?.id ?? null },
      update: {},
    });
    res.status(201).json(row.label);
  })
);

// Delete a registered financial year. Note: a year still shows in the picker if any inward/outward/
// payment is dated in it (the list is derived from data too) — deleting only removes the manual row.
financialYearsRouter.delete(
  '/:label',
  requirePermission('manage_financial_years'),
  asyncHandler(async (req, res) => {
    await prisma.financialYear.deleteMany({ where: { label: req.params.label } });
    res.status(204).end();
  })
);

financialYearsRouter.delete(
  '/:label',
  requirePermission('manage_financial_years'),
  asyncHandler(async (req, res) => {
    await prisma.financialYear.deleteMany({ where: { label: req.params.label } });
    res.status(204).end();
  })
);
