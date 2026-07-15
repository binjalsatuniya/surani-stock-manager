import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { requireRole } from '../../middleware/requireRole';
import { HttpError, NotFoundError } from '../../middleware/errorHandler';
import { writeAuditLog } from '../../lib/audit';

export const approvalsRouter = Router();
approvalsRouter.use(authenticate);

approvalsRouter.get(
  '/',
  requirePermission('view_approvals'),
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const rows = await prisma.approvalRequest.findMany({
      where: status ? { status } : undefined,
      include: { requestedBy: true, resolvedBy: true },
      orderBy: { requestedAt: 'desc' },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        target: r.target,
        targetId: r.targetId,
        payload: r.payload,
        label: r.label,
        status: r.status,
        requestedBy: r.requestedBy.name,
        resolvedBy: r.resolvedBy?.name ?? null,
        requestedAt: r.requestedAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      }))
    );
  })
);

/**
 * Ported from approveRequest() (index.html:1332-1360). Only superadmin may approve/reject —
 * this is the counterpart to admins' mutateOrQueue()-deferred edits/deletes.
 */
approvalsRouter.post(
  '/:id/approve',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const r = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
    if (!r) throw new NotFoundError('Approval request not found');
    if (r.status !== 'pending') throw new HttpError(400, 'Request already resolved');

    await prisma.$transaction(async (tx) => {
      if (r.kind === 'delete') {
        // Let FK-constraint failures (e.g. item still referenced by existing transactions)
        // propagate naturally — swallowing them here would leave the transaction aborted and
        // cause the audit-log write below to fail with a confusing, unrelated error instead.
        if (r.target === 'inward') {
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'inward', sourceId: r.targetId } });
          await tx.inward.delete({ where: { id: r.targetId } });
        } else if (r.target === 'outward') {
          await tx.freightEntry.deleteMany({ where: { outwardId: r.targetId } });
          await tx.handlingEntry.deleteMany({ where: { sourceKind: 'outward', sourceId: r.targetId } });
          await tx.outward.delete({ where: { id: r.targetId } });
        } else if (r.target === 'payment') {
          await tx.payment.delete({ where: { id: r.targetId } });
        } else if (r.target === 'party') {
          await tx.party.delete({ where: { id: r.targetId } });
        } else if (r.target === 'item') {
          await tx.item.delete({ where: { id: r.targetId } });
        }
        await writeAuditLog(tx, {
          action: 'delete (approved)',
          target: r.target,
          targetId: r.targetId,
          label: r.label,
          details: { requestId: r.id, requestedBy: r.requestedById },
          actorId: req.user!.id,
          actorName: req.user!.name,
        });
      } else if (r.kind === 'edit') {
        const changes = (r.payload as { changes?: Record<string, unknown> }).changes ?? {};
        if (r.target === 'inward') {
          await tx.inward.update({ where: { id: r.targetId }, data: changes as never });
        } else if (r.target === 'outward') {
          await tx.outward.update({ where: { id: r.targetId }, data: changes as never });
        }
        await writeAuditLog(tx, {
          action: 'edit (approved)',
          target: r.target,
          targetId: r.targetId,
          label: r.label,
          details: { requestId: r.id, requestedBy: r.requestedById, changes },
          actorId: req.user!.id,
          actorName: req.user!.name,
        });
      }

      await tx.approvalRequest.update({
        where: { id: r.id },
        data: { status: 'approved', resolvedAt: new Date(), resolvedById: req.user!.id },
      });
    });

    res.json({ ok: true });
  })
);

approvalsRouter.post(
  '/:id/reject',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const r = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
    if (!r) throw new NotFoundError('Approval request not found');
    if (r.status !== 'pending') throw new HttpError(400, 'Request already resolved');

    await prisma.approvalRequest.update({
      where: { id: r.id },
      data: { status: 'rejected', resolvedAt: new Date(), resolvedById: req.user!.id },
    });
    res.json({ ok: true });
  })
);
