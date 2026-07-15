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

/**
 * Ported from the legacy client's canEditDelete()/tryDelete()/requestApproval() (index.html:1264-1331),
 * now enforced server-side so it can't be bypassed by calling the API directly (the old app only ever
 * hid buttons client-side — a raw request could execute regardless of role).
 * superadmin -> executes immediately + audit log. admin -> queued for superadmin approval. else -> 403.
 */
export async function mutateOrQueue<T>(input: MutateOrQueueInput<T>): Promise<MutateOrQueueResult<T>> {
  if (input.user.role === 'superadmin') {
    const result = await input.execute();
    await writeAuditLog(prisma, {
      action: input.kind,
      target: input.target,
      targetId: input.targetId,
      label: input.label,
      actorId: input.user.id,
      actorName: input.user.name,
    });
    return { executed: true, queued: false, result };
  }
  if (input.user.role === 'admin') {
    await prisma.approvalRequest.create({
      data: {
        kind: input.kind,
        target: input.target,
        targetId: input.targetId,
        payload: input.payload,
        label: input.label,
        requestedById: input.user.id,
      },
    });
    return { executed: false, queued: true };
  }
  throw new ForbiddenError('You do not have permission');
}
