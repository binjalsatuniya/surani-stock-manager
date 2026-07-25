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

// The categories of data a Reset can wipe. User logins and app config are never wiped.
export const ALL_RESET_SCOPES = [
  'transactions',
  'expenses',
  'parties',
  'items',
  'salesPersons',
  'loginLocations',
  'auditLog',
  'approvals',
  'financialYears',
] as const;
export type ResetScope = (typeof ALL_RESET_SCOPES)[number];

// Some categories can't be deleted unless their dependents are too (foreign keys). Returns an error
// message if the selection is inconsistent, otherwise null.
export function validateResetScopes(scopes: Set<string>): string | null {
  if (scopes.size === 0) return 'Select at least one type of data to reset.';
  if (scopes.has('parties') && !scopes.has('transactions'))
    return 'To delete Parties you must also delete Sales & Purchases (they reference parties).';
  if (scopes.has('items') && !scopes.has('transactions'))
    return 'To delete Items you must also delete Sales & Purchases (they reference items).';
  if (scopes.has('salesPersons') && (!scopes.has('parties') || !scopes.has('expenses')))
    return 'To delete Sales Persons you must also delete Parties and Expenses.';
  return null;
}

/**
 * Delete only the selected categories of business data, children before parents. User logins and
 * app config always survive. Must run inside a transaction. Validate scopes with validateResetScopes
 * first.
 */
export async function wipeSelected(tx: Prisma.TransactionClient, scopes: Set<string>) {
  if (scopes.has('transactions')) {
    await tx.paymentAllocation.deleteMany();
    await tx.paymentInwardAllocation.deleteMany();
    await tx.freightEntry.deleteMany();
    await tx.handlingEntry.deleteMany();
    await tx.payment.deleteMany();
    await tx.outward.deleteMany();
    await tx.inward.deleteMany();
  }
  if (scopes.has('expenses')) await tx.salesPersonExpense.deleteMany();
  if (scopes.has('loginLocations')) await tx.loginLocation.deleteMany();
  if (scopes.has('auditLog')) await tx.auditLog.deleteMany();
  if (scopes.has('approvals')) await tx.approvalRequest.deleteMany();
  if (scopes.has('items')) await tx.item.deleteMany();
  if (scopes.has('parties')) await tx.party.deleteMany();
  if (scopes.has('salesPersons')) await tx.salesPerson.deleteMany();
  if (scopes.has('financialYears')) await tx.financialYear.deleteMany();
}
