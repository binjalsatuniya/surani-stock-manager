import { prisma } from '../db/prisma';
import { addDays, daysBetween } from './dateMath';

export interface UnpaidInvoice {
  outwardId: string;
  invNo: string | null;
  date: string;
  amount: number;
  balance: number;
  dueDate: string | null;
  dueDays: number | null;
}

/**
 * Ported from unpaidInvoicesForParty() in the legacy app (index.html:2975).
 * Outstanding balance = outward.amount - sum(paymentAllocations for that outward).
 * Sorted oldest invoice/order date first (the FIFO ordering basis).
 */
export async function unpaidInvoicesForParty(partyId: string): Promise<UnpaidInvoice[]> {
  const outward = await prisma.outward.findMany({
    where: { partyId, fulfil: { not: 'cancelled' }, payStatus: { not: 'received' } },
    include: { paymentAllocations: true },
    orderBy: { date: 'asc' },
  });

  const today = new Date().toISOString().slice(0, 10);
  const result: UnpaidInvoice[] = [];

  for (const o of outward) {
    const allocated = o.paymentAllocations.reduce((s, a) => s + Number(a.amount), 0);
    const balance = Number(o.amount) - allocated;
    if (balance <= 0.005) continue;

    const basis = o.invDate ?? o.deliveredAt ?? o.date;
    const basisStr = basis.toISOString().slice(0, 10);
    const dueDate = addDays(basisStr, o.creditDays || 0);
    const dueDays = daysBetween(dueDate, today);

    result.push({
      outwardId: o.id,
      invNo: o.invNo,
      date: o.date.toISOString().slice(0, 10),
      amount: Number(o.amount),
      balance,
      dueDate,
      dueDays,
    });
  }

  return result;
}

export interface Allocation {
  outwardId: string;
  amount: number;
}

/**
 * Ported from addPayment()'s FIFO loop (index.html:3101-3107): given the invoices the user
 * selected (in the order they want to prioritize — normally oldest-first), spread `amount`
 * across them, each capped at its own outstanding balance, until the amount runs out.
 */
export function allocateFifo(amount: number, selected: { outwardId: string; balance: number }[]): Allocation[] {
  let remaining = amount;
  const allocations: Allocation[] = [];
  for (const sel of selected) {
    if (remaining <= 0) break;
    const give = Math.min(sel.balance, remaining);
    if (give > 0) {
      allocations.push({ outwardId: sel.outwardId, amount: Math.round(give * 100) / 100 });
      remaining -= give;
    }
  }
  return allocations;
}
