import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError } from '../../middleware/errorHandler';
import { exportAllData } from '../../lib/backupData';

export const backupRouter = Router();
backupRouter.use(authenticate);

// Matches the legacy app's downloadBackup() shape ({version, exportedAt, db:{...}}) but with this
// system's own native (Prisma) row shapes — this is a v2-to-v2 safety net, not the legacy importer
// (that's the separate one-off migration script in tools/migrate-legacy-data, see Phase 6).
backupRouter.get(
  '/export',
  requirePermission('view_backup'),
  asyncHandler(async (_req, res) => {
    res.json({ version: 2, exportedAt: new Date().toISOString(), db: await exportAllData(prisma) });
  })
);

const importSchema = z.object({
  version: z.number(),
  db: z.record(z.array(z.record(z.unknown()))),
});

// Full replace, same destructive semantics + superadmin-only gate as the legacy restoreFromFile().
backupRouter.post(
  '/import',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const input = importSchema.parse(req.body);
    if (input.version !== 2) throw new HttpError(400, 'Unsupported backup version — expected a v2 backup file');
    const db = input.db;

    await prisma.$transaction(async (tx) => {
      // Delete in FK-dependency order, then recreate in reverse (parent-first) order.
      await tx.paymentAllocation.deleteMany();
      await tx.paymentInwardAllocation.deleteMany();
      await tx.freightEntry.deleteMany();
      await tx.handlingEntry.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.approvalRequest.deleteMany();
      await tx.loginLocation.deleteMany();
      await tx.salesPersonExpense.deleteMany();
      await tx.trip.deleteMany();
      await tx.payment.deleteMany();
      await tx.outward.deleteMany();
      await tx.inward.deleteMany();
      await tx.item.deleteMany();
      await tx.party.deleteMany();
      await tx.salesPerson.deleteMany();
      await tx.financialYear.deleteMany();
      await tx.refreshToken.deleteMany();
      await tx.user.deleteMany();

      if (db.users) await tx.user.createMany({ data: db.users as never[] });
      if (db.salesPersons) await tx.salesPerson.createMany({ data: db.salesPersons as never[] });
      // Trips must exist before the expenses that reference them.
      if (db.expenseTrips) await tx.trip.createMany({ data: db.expenseTrips as never[] });
      if (db.salespersonExpenses) await tx.salesPersonExpense.createMany({ data: db.salespersonExpenses as never[] });
      if (db.parties) await tx.party.createMany({ data: db.parties as never[] });
      if (db.items) await tx.item.createMany({ data: db.items as never[] });
      if (db.financialYears) await tx.financialYear.createMany({ data: db.financialYears as never[] });
      if (db.loginLocations) await tx.loginLocation.createMany({ data: db.loginLocations as never[] });
      if (db.inward)
        await tx.inward.createMany({ data: (db.inward as Record<string, unknown>[]).map(({ financialYear: _fy, ...rest }) => rest) as never[] });
      if (db.outward)
        await tx.outward.createMany({ data: (db.outward as Record<string, unknown>[]).map(({ financialYear: _fy, ...rest }) => rest) as never[] });
      if (db.payments)
        await tx.payment.createMany({ data: (db.payments as Record<string, unknown>[]).map(({ financialYear: _fy, ...rest }) => rest) as never[] });
      if (db.paymentAllocations) await tx.paymentAllocation.createMany({ data: db.paymentAllocations as never[] });
      if (db.paymentInwardAllocations) await tx.paymentInwardAllocation.createMany({ data: db.paymentInwardAllocations as never[] });
      if (db.freightEntries) await tx.freightEntry.createMany({ data: db.freightEntries as never[] });
      if (db.handlingEntries) await tx.handlingEntry.createMany({ data: db.handlingEntries as never[] });
      if (db.approvalRequests) await tx.approvalRequest.createMany({ data: db.approvalRequests as never[] });
      if (db.auditLog) await tx.auditLog.createMany({ data: db.auditLog as never[] });
    });

    res.json({ ok: true });
  })
);
