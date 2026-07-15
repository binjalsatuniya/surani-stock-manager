import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

export const auditLogRouter = Router();
auditLogRouter.use(authenticate);

auditLogRouter.get(
  '/',
  requirePermission('view_audit_log'),
  asyncHandler(async (req, res) => {
    const { target, targetId } = req.query as Record<string, string | undefined>;
    const rows = await prisma.auditLog.findMany({
      where: { ...(target ? { target } : {}), ...(targetId ? { targetId } : {}) },
      orderBy: { timestamp: 'desc' },
    });
    res.json(
      rows.map((r) => ({
        id: r.id,
        action: r.action,
        target: r.target,
        targetId: r.targetId,
        label: r.label,
        details: r.details,
        actorId: r.actorId,
        actorName: r.actorName,
        timestamp: r.timestamp.toISOString(),
      }))
    );
  })
);
