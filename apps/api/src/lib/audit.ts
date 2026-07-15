import type { Prisma, PrismaClient } from '@prisma/client';

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface AuditLogInput {
  action: string; // edit | delete | edit (approved) | delete (approved) | cancel | restore
  target: string; // inward | outward | payment | party | item
  targetId?: string | null;
  label?: string | null;
  details?: Record<string, unknown> | null;
  actorId: string | null;
  actorName: string;
}

export async function writeAuditLog(db: DbClient, input: AuditLogInput) {
  await db.auditLog.create({
    data: {
      action: input.action,
      target: input.target,
      targetId: input.targetId ?? null,
      label: input.label ?? null,
      details: input.details ?? undefined,
      actorId: input.actorId,
      actorName: input.actorName,
    },
  });
}
