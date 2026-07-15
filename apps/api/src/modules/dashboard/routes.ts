import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/**
 * Ported from partyBalance() (index.html:1415-1426): + means the party owes us (receivable),
 * - means we owe the party (payable). Opening balance + unsettled sales - purchases +/- payments
 * - freight/handling payable to that party (if it's a transporter/handling agent).
 */
dashboardRouter.get(
  '/kpis',
  requirePermission('view_dashboard'),
  asyncHandler(async (_req, res) => {
    const [parties, outward, inward, payments, freight, handling, items] = await Promise.all([
      prisma.party.findMany(),
      prisma.outward.findMany({ where: { fulfil: { not: 'cancelled' } } }),
      prisma.inward.findMany({ where: { status: 'received' } }),
      prisma.payment.findMany(),
      prisma.freightEntry.findMany(),
      prisma.handlingEntry.findMany(),
      prisma.item.findMany(),
    ]);

    let recv = 0;
    let pay = 0;
    for (const p of parties) {
      let b = Number(p.opening);
      for (const o of outward) {
        if (o.partyId === p.id && o.payStatus !== 'received') b += Number(o.amount);
      }
      for (const i of inward) {
        if (i.partyId === p.id) b -= Number(i.amount);
      }
      for (const pm of payments) {
        if (pm.partyId === p.id) b += pm.dir === 'out' ? Number(pm.amount) : -Number(pm.amount);
      }
      for (const f of freight) {
        if (f.transporterId === p.id) b -= Number(f.freight);
      }
      for (const h of handling) {
        if (h.handlingAgentId === p.id) b -= Number(h.amount);
      }
      if (b > 0) recv += b;
      else pay += -b;
    }

    const inwardByItem = new Map<string, number>();
    for (const i of inward) inwardByItem.set(i.itemId, (inwardByItem.get(i.itemId) ?? 0) + Number(i.qty));
    const outwardByItem = new Map<string, number>();
    for (const o of outward) outwardByItem.set(o.itemId, (outwardByItem.get(o.itemId) ?? 0) + Number(o.qty));

    const lowStockCount = items.filter((i) => {
      const stock = Number(i.opening) + (inwardByItem.get(i.id) ?? 0) - (outwardByItem.get(i.id) ?? 0);
      return Number(i.reorder) > 0 && stock <= Number(i.reorder);
    }).length;

    const pendingOrders = outward.filter((o) => o.fulfil === 'pending').length;

    res.json({
      totalItems: items.length,
      receivable: Math.round(recv * 100) / 100,
      payable: Math.round(pay * 100) / 100,
      netPosition: Math.round((recv - pay) * 100) / 100,
      lowStockCount,
      pendingOrders,
    });
  })
);
