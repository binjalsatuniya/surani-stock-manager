import type { Role } from '@surani/shared';
import { prisma } from '../db/prisma';
import { writeAuditLog } from './audit';
import { ForbiddenError } from '../middleware/errorHandler';

export type ApprovalKind = 'edit' | 'delete';
export type ApprovalTarget = 'inward' | 'outward' | 'payment' | 'party' | 'item';

export interface MutateOrQueueInput<T> {
  user: { id: string; name: string; role: Role };
  kind: ApprovalKind;
  target: ApprovalTarget;
  targetId: string;
  payload: Record<string, unknown>;
  label: string;
  execute: () => Promise<T>;
}

export interface MutateOrQueueResult<T> {
  executed: boolean;
  queued: boolean;
  result?: T;
}

// Fetch a record's current scalar state by target, so it can be snapshotted for reversal.
export async function fetchByTarget(target: ApprovalTarget, id: string): Promise<Record<string, unknown> | null> {
  const row =
    target === 'inward'
      ? await prisma.inward.findUnique({ where: { id } })
      : target === 'outward'
      ? await prisma.outward.findUnique({ where: { id } })
      : target === 'payment'
      ? await prisma.payment.findUnique({ where: { id } })
      : target === 'party'
      ? await prisma.party.findUnique({ where: { id } })
      : target === 'item'
      ? await prisma.item.findUnique({ where: { id } })
      : null;
  // JSON round-trip makes it safe for the audit `details` column (Decimals -> strings, dates -> ISO).
  return row ? (JSON.parse(JSON.stringify(row)) as Record<string, unknown>) : null;
}

/**
 * Both superadmin and admin now execute edits/deletes immediately (admins no longer queue) — every
 * change is captured in the Audit Log WITH a "before" snapshot so a wrong entry can be reversed.
 * account/staff still get 403. Enforced server-side so it can't be bypassed by calling the API.
 */
export async function mutateOrQueue<T>(input: MutateOrQueueInput<T>): Promise<MutateOrQueueResult<T>> {
  if (input.user.role !== 'superadmin' && input.user.role !== 'admin') {
    throw new ForbiddenError('You do not have permission');
  }
  // Snapshot the record before the change (needed to reverse it later).
  const before = await fetchByTarget(input.target, input.targetId);
  const result = await input.execute();
  const changes = (input.payload as { changes?: Record<string, unknown> }).changes ?? null;
  await writeAuditLog(prisma, {
    action: input.kind,
    target: input.target,
    targetId: input.targetId,
    label: input.label,
    details: { before, changes },
    actorId: input.user.id,
    actorName: input.user.name,
  });
  return { executed: true, queued: false, result };
}
