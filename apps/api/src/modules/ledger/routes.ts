import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { unpaidInvoicesForParty } from '../../lib/fifoAllocation';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

export const ledgerRouter = Router();
ledgerRouter.use(authenticate);

/**
 * Ported from computeDueLedgerGroups() (index.html:3002) — every party's outstanding
 * invoices grouped together with a per-party total, sorted by total descending.
 * Query: ?salesPersonId= to restrict to one sales person's parties, omit for all.
 */
ledgerRouter.get(
  '/due',
  requirePermission('view_payments'),
  asyncHandler(async (req, res) => {
    const salesPersonId = req.query.salesPersonId as string | undefined;
    const parties = await prisma.party.findMany({
      where: salesPersonId ? { salesPersonId } : undefined,
    });

    const groups = [];
    for (const party of parties) {
      const entries = await unpaidInvoicesForParty(party.id);
      if (!entries.length) continue;
      const total = entries.reduce((s, e) => s + e.balance, 0);
      groups.push({ party: { id: party.id, name: party.name, phone: party.phone }, entries, total });
    }
    groups.sort((a, b) => b.total - a.total);
    res.json(groups);
  })
);

/**
 * Creditor pending payments — parties we still owe money to (net balance is negative).
 * Same balance formula as the dashboard's payable total, but broken down per party.
 */
ledgerRouter.get(
  '/payable',
  requirePermission('view_payments'),
  asyncHandler(async (_req, res) => {
    const [parties, outward, inward, payments, freight, handling] = await Promise.all([
      prisma.party.findMany(),
      prisma.outward.findMany({ where: { fulfil: { not: 'cancelled' } } }),
      prisma.inward.findMany({ where: { status: 'received' } }),
      prisma.payment.findMany(),
      prisma.freightEntry.findMany(),
      prisma.handlingEntry.findMany(),
    ]);

    const groups = [];
    for (const p of parties) {
      let b = Number(p.opening);
      for (const o of outward) if (o.partyId === p.id && o.payStatus !== 'received') b += Number(o.amount);
      for (const i of inward) if (i.partyId === p.id) b -= Number(i.amount);
      // A payment settles its full value: cash (amount) plus any TDS deducted at source.
      for (const pm of payments)
        if (pm.partyId === p.id) {
          const settle = Number(pm.amount) + Number(pm.tdsAmount);
          b += pm.dir === 'out' ? settle : -settle;
        }
      for (const f of freight) if (f.transporterId === p.id) b -= Number(f.freight);
      for (const h of handling) if (h.handlingAgentId === p.id) b -= Number(h.amount);
      if (b < 0) groups.push({ party: { id: p.id, name: p.name, phone: p.phone }, amount: Math.round(-b * 100) / 100 });
    }
    groups.sort((a, b) => b.amount - a.amount);
    res.json(groups);
  })
);

/**
 * Full per-item ledger: every purchase (stock in) and sale (stock out) for one item in date
 * order, with the tax split on each line. The caller adds the item's opening qty and runs the
 * balance forward — the same rows/filters the Live Stock figure uses (see items/stock), so the
 * closing balance always agrees with Live Stock.
 */
ledgerRouter.get(
  '/item/:id',
  requirePermission('view_ledgers'),
  asyncHandler(async (req, res) => {
    const itemId = req.params.id;
    const [inward, outward, parties] = await Promise.all([
      prisma.inward.findMany({ where: { itemId, status: 'received' } }),
      prisma.outward.findMany({ where: { itemId, fulfil: { not: 'cancelled' } } }),
      prisma.party.findMany({ select: { id: true, name: true } }),
    ]);
    const nameOf = new Map(parties.map((p) => [p.id, p.name]));
    const split = (amount: unknown, gst: unknown) => ({
      taxable: Math.round((Number(amount) - Number(gst)) * 100) / 100,
      tax: Number(gst),
      total: Number(amount),
    });

    const entries = [
      ...inward.map((i) => ({
        date: i.date.toISOString().slice(0, 10),
        kind: 'in' as const,
        description: `Purchase — ${i.invNo || 'no invoice'}`,
        partyName: nameOf.get(i.partyId) ?? '—',
        qtyIn: Number(i.qty),
        qtyOut: 0,
        rate: Number(i.rate),
        ...split(i.amount, i.gst),
      })),
      ...outward.map((o) => ({
        date: o.date.toISOString().slice(0, 10),
        kind: 'out' as const,
        description: `Sale — ${o.invNo || 'no invoice'}`,
        partyName: nameOf.get(o.partyId) ?? '—',
        qtyIn: 0,
        qtyOut: Number(o.qty),
        rate: Number(o.rate),
        ...split(o.amount, o.gst),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json(entries);
  })
);

/**
 * Full per-party ledger: sales invoices (DR), purchases (CR), payments, and freight/handling
 * payables where this party is the transporter/handling agent — combined chronologically.
 */
ledgerRouter.get(
  '/party/:id',
  requirePermission('view_ledgers'),
  asyncHandler(async (req, res) => {
    const partyId = req.params.id;
    const [outward, inward, payments, freight, handling] = await Promise.all([
      prisma.outward.findMany({ where: { partyId, fulfil: { not: 'cancelled' } } }),
      prisma.inward.findMany({ where: { partyId, status: 'received' } }),
      prisma.payment.findMany({ where: { partyId } }),
      prisma.freightEntry.findMany({ where: { transporterId: partyId } }),
      prisma.handlingEntry.findMany({ where: { handlingAgentId: partyId } }),
    ]);

    const entries = [
      // Sales and purchases carry a tax split: `amount` is the total (goods + GST),
      // so the value before tax is amount − gst.
      ...outward.map((o) => ({
        date: o.date.toISOString().slice(0, 10),
        description: `Sale — ${o.invNo || 'no invoice'}`,
        dr: Number(o.amount),
        cr: 0,
        taxable: Math.round((Number(o.amount) - Number(o.gst)) * 100) / 100,
        tax: Number(o.gst),
        payStatus: o.payStatus,
      })),
      ...inward.map((i) => ({
        date: i.date.toISOString().slice(0, 10),
        description: `Purchase — ${i.invNo || 'no invoice'}`,
        dr: 0,
        cr: Number(i.amount),
        taxable: Math.round((Number(i.amount) - Number(i.gst)) * 100) / 100,
        tax: Number(i.gst),
      })),
      ...payments.map((p) => {
        // The ledger value is the full settlement: cash plus any TDS deducted at source.
        const settle = Number(p.amount) + Number(p.tdsAmount);
        const tdsNote = Number(p.tdsAmount) > 0 ? ` incl. TDS ${Number(p.tdsAmount).toFixed(2)}` : '';
        return {
          date: p.date.toISOString().slice(0, 10),
          description: `Payment ${p.dir === 'in' ? 'received' : 'paid'} (${p.mode})${tdsNote}`,
          dr: p.dir === 'out' ? settle : 0,
          cr: p.dir === 'in' ? settle : 0,
        };
      }),
      ...freight.map((f) => ({
        date: f.date.toISOString().slice(0, 10),
        description: `Freight payable — ${f.invNo || ''}`,
        dr: Number(f.freight),
        cr: 0,
      })),
      ...handling.map((h) => ({
        date: h.date.toISOString().slice(0, 10),
        description: `Handling payable — ${h.invNo || ''}`,
        dr: Number(h.amount),
        cr: 0,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    res.json(entries);
  })
);
