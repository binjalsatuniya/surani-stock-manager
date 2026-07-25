import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

// A client that works both as the top-level PrismaClient and inside a $transaction.
type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Read every table into one plain object — the shape used by Backup export and by the safety
 * snapshot taken right before a Reset. Kept complete (incl. expenses, login locations and paid-side
 * allocations) so a Reset is fully restorable through the Backup → Restore flow.
 */
export async function exportAllData(client: Db = prisma) {
  const [
    users,
    parties,
    items,
    salesPersons,
    salespersonExpenses,
    inward,
    outward,
    payments,
    paymentAllocations,
    paymentInwardAllocations,
    freightEntries,
    handlingEntries,
    loginLocations,
    approvalRequests,
    auditLog,
    financialYears,
  ] = await Promise.all([
    client.user.findMany(),
    client.party.findMany(),
    client.item.findMany(),
    client.salesPerson.findMany(),
    client.salesPersonExpense.findMany(),
    client.inward.findMany(),
    client.outward.findMany(),
    client.payment.findMany(),
    client.paymentAllocation.findMany(),
    client.paymentInwardAllocation.findMany(),
    client.freightEntry.findMany(),
    client.handlingEntry.findMany(),
    client.loginLocation.findMany(),
    client.approvalRequest.findMany(),
    client.auditLog.findMany(),
    client.financialYear.findMany(),
  ]);

  return {
    users,
    parties,
    items,
    salesPersons,
    salespersonExpenses,
    inward,
    outward,
    payments,
    paymentAllocations,
    paymentInwardAllocations,
    freightEntries,
    handlingEntries,
    loginLocations,
    approvalRequests,
    auditLog,
    financialYears,
  };
}

/**
 * Delete ALL business data but keep the things that must survive a Reset:
 *   - user logins (users) and their sessions (refresh_tokens)
 *   - app configuration (whatsapp_templates, field_settings)
 * Children are deleted before parents to respect foreign keys. Must run inside a transaction.
 */
export async function wipeBusinessData(tx: Prisma.TransactionClient) {
  await tx.paymentAllocation.deleteMany();
  await tx.paymentInwardAllocation.deleteMany();
  await tx.freightEntry.deleteMany();
  await tx.handlingEntry.deleteMany();
  await tx.auditLog.deleteMany();
  await tx.approvalRequest.deleteMany();
  await tx.loginLocation.deleteMany();
  await tx.salesPersonExpense.deleteMany();
  await tx.payment.deleteMany();
  await tx.outward.deleteMany();
  await tx.inward.deleteMany();
  await tx.item.deleteMany();
  await tx.party.deleteMany();
  await tx.salesPerson.deleteMany();
  await tx.financialYear.deleteMany();
}
