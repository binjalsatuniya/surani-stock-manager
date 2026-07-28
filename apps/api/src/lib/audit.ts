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

/**
 * Best-effort activity log for non-reversible actions (creates, money actions, logins, etc.).
 * These are informational only (no "before" snapshot), so they never show a Reverse button.
 * Errors are swallowed — logging must never break the user's actual action (a sale, a payment…).
 */
export async function logActivity(
  db: DbClient,
  actor: { id: string | null; name: string },
  action: string,
  target: string,
  targetId: string | null,
  label: string
) {
  try {
    await writeAuditLog(db, { action, target, targetId, label, actorId: actor.id, actorName: actor.name });
  } catch (err) {
    console.error('[audit] failed to log activity:', action, target, err);
  }
}
