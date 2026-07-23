import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../lib/audit';

export const auditLogRouter = Router();
auditLogRouter.use(authenticate);

// Fields that must not be written back when reversing (DB-managed / generated).
const STRIP = new Set(['financialYear', 'createdAt', 'updatedAt']);
type Target = 'inward' | 'outward' | 'payment' | 'party' | 'item';
const REVERSIBLE = new Set(['edit', 'delete', 'edit (approved)', 'delete (approved)']);

function clean(obj: Record<string, unknown>, alsoDropId = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP.has(k)) continue;
    if (alsoDropId && k === 'id') continue;
    out[k] = v;
  }
  return out;
}

async function updateByTarget(target: Target, id: string, data: Record<string, unknown>) {
  const d = data as never;
  if (target === 'inward') return prisma.inward.update({ where: { id }, data: d });
  if (target === 'outward') return prisma.outward.update({ where: { id }, data: d });
  if (target === 'payment') return prisma.payment.update({ where: { id }, data: d });
  if (target === 'party') return prisma.party.update({ where: { id }, data: d });
  return prisma.item.update({ where: { id }, data: d });
}

async function createByTarget(target: Target, data: Record<string, unknown>) {
  const d = data as never;
  if (target === 'inward') return prisma.inward.create({ data: d });
  if (target === 'outward') return prisma.outward.create({ data: d });
  if (target === 'payment') return prisma.payment.create({ data: d });
  if (target === 'party') return prisma.party.create({ data: d });
  return prisma.item.create({ data: d });
}

auditLogRouter.get(
  '/',
  requirePermission('view_audit_log'),
  asyncHandler(async (req, res) => {
    const { target, targetId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.auditLog.findMany({
      where: { ...(target ? { target } : {}), ...(targetId ? { targetId } : {}) },
      orderBy: { timestamp: 'desc' },
    });
    // Which audit rows have already been reversed (a later 'reverse' entry points back at them).
    const reversedIds = new Set<string>();
    for (const r of rows) {
      if (r.action === 'reverse') {
        const rid = (r.details as { reversedAuditId?: string } | null)?.reversedAuditId;
        if (rid) reversedIds.add(rid);
      }
    }
    res.json(
      rows.map((r) => {
        const details = r.details as { before?: unknown } | null;
        return {
          id: r.id,
          action: r.action,
          target: r.target,
          targetId: r.targetId,
          label: r.label,
          details: r.details,
          actorId: r.actorId,
          actorName: r.actorName,
          timestamp: r.timestamp.toISOString(),
          // The UI shows a Reverse button when this is true.
          reversible:
            REVERSIBLE.has(r.action) && !!details?.before && !!r.targetId && !reversedIds.has(r.id),
          reversed: reversedIds.has(r.id),
        };
      })
    );
  })
);

// Reverse a wrong edit/delete: restore the record to its snapshotted "before" state. Admin or
// Super Admin only (the same people who can edit). Writes a 'reverse' audit entry and refuses to
// reverse the same entry twice.
auditLogRouter.post(
  '/:id/reverse',
  requireRole('superadmin', 'admin'),
  asyncHandler(async (req, res) => {
    const entry = await prisma.auditLog.findUnique({ where: { id: req.params.id } });
    if (!entry) throw new NotFoundError('Audit entry not found');
    if (!REVERSIBLE.has(entry.action)) throw new HttpError(400, 'This entry cannot be reversed');
    if (!entry.targetId) throw new HttpError(400, 'This entry has no target to reverse');

    const details =
      (entry.details as { before?: Record<string, unknown>; changes?: Record<string, unknown> } | null) ?? {};
    if (!details.before) throw new HttpError(400, 'No saved snapshot to reverse to');

    const already = await prisma.auditLog.findFirst({
      where: { action: 'reverse', details: { path: ['reversedAuditId'], equals: entry.id } },
    });
    if (already) throw new HttpError(400, 'This entry has already been reversed');

    const target = entry.target as Target;
    const isDelete = entry.action.startsWith('delete');

    if (isDelete) {
      // Re-create the deleted record from its snapshot (keeps the original id).
      await createByTarget(target, clean(details.before));
    } else {
      // Restore only the fields that were changed, back to their old values.
      const changedKeys = details.changes ? Object.keys(details.changes) : Object.keys(details.before);
      const restore: Record<string, unknown> = {};
      for (const k of changedKeys) {
        if (STRIP.has(k) || k === 'id') continue;
        if (k in details.before) restore[k] = details.before[k];
      }
      await updateByTarget(target, entry.targetId, restore);
    }

    await writeAuditLog(prisma, {
      action: 'reverse',
      target,
      targetId: entry.targetId,
      label: `Reversed: ${entry.label ?? entry.action}`,
      details: { reversedAuditId: entry.id },
      actorId: req.user!.id,
      actorName: req.user!.name,
    });

    res.json({ ok: true });
  })
);
