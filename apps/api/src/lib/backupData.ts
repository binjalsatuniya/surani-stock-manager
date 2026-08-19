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
    expenseTrips,
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
    client.trip.findMany(),
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
    expenseTrips,
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
// 'sales' and 'purchases' replaced the old combined 'transactions'; that key is still ACCEPTED as a
// backward-compatible alias (older phone clients send it) — see wipeSelected / validateResetScopes.
export const ALL_RESET_SCOPES = [
  'sales',
  'purchases',
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
  // Parties and Items are referenced by BOTH sides, so both must go before they can. The legacy
  // 'transactions' alias means "both sales and purchases".
  const bothTransactions = scopes.has('transactions') || (scopes.has('sales') && scopes.has('purchases'));
  if (scopes.has('parties') && !bothTransactions)
    return 'To delete Parties you must also delete both Sales and Purchases (they reference parties).';
  if (scopes.has('items') && !bothTransactions)
    return 'To delete Items you must also delete both Sales and Purchases (they reference items).';
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
  // 'transactions' is the legacy combined key — treat it as both sales and purchases.
  const wipeSales = scopes.has('sales') || scopes.has('transactions');
  const wipePurchases = scopes.has('purchases') || scopes.has('transactions');

  if (wipeSales) {
    // Sales side: outward invoices, the receipts (dir='in') taken against them, and the freight and
    // handling posted on them. Deleting an outward row cascades its freight entries and payment
    // allocations (FK onDelete: Cascade); handling entries are polymorphic (no FK) so go by hand.
    await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward' } });
    await tx.payment.deleteMany({ where: { dir: 'in' } });
    await tx.outward.deleteMany();
  }
  if (wipePurchases) {
    // Purchase side: inward invoices, the payments (dir='out') made against them, and their freight
    // and handling. Deleting an inward row cascades its freight and inward payment allocations.
    await tx.handlingEntry.deleteMany({ where: { sourceKind: 'inward' } });
    await tx.payment.deleteMany({ where: { dir: 'out' } });
    await tx.inward.deleteMany();
  }
  if (scopes.has('expenses')) {
    await tx.salesPersonExpense.deleteMany();
    await tx.trip.deleteMany();
  }
  if (scopes.has('loginLocations')) await tx.loginLocation.deleteMany();
  if (scopes.has('auditLog')) await tx.auditLog.deleteMany();
  if (scopes.has('approvals')) await tx.approvalRequest.deleteMany();
  if (scopes.has('items')) await tx.item.deleteMany();
  if (scopes.has('parties')) await tx.party.deleteMany();
  if (scopes.has('salesPersons')) await tx.salesPerson.deleteMany();
  if (scopes.has('financialYears')) await tx.financialYear.deleteMany();
}
