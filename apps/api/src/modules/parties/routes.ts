import { Router } from 'express';
import { z } from 'zod';
import { hasPermission } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { toPartyDTO } from '../../lib/serializeMasters';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError, HttpError, NotFoundError } from '../../middleware/errorHandler';
import { mutateOrQueue } from '../../lib/approvalGate';
import { logActivity } from '../../lib/audit';

export const partiesRouter = Router();
partiesRouter.use(authenticate);

const partyTypeEnum = z.enum(['debtor', 'creditor', 'both', 'transporter', 'handling']);

const partySchema = z.object({
  name: z.string().min(1),
  type: partyTypeEnum,
  salesPersonId: z.string().uuid().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  gst: z.string().nullable().optional(),
  opening: z.coerce.number().default(0),
  creditDays: z.coerce.number().int().default(0),
  defaultFreight: z.coerce.number().default(0),
  address: z.string().nullable().optional(),
  locationUrl: z.string().nullable().optional(),
  vehicle: z.string().nullable().optional(),
});

/**
 * Legacy app had a separate `edit_transporters` permission distinct from `edit_parties`
 * (e.g. a staff member could manage transporters without touching the debtor/creditor
 * master). Since transporters now live in the same `parties` table (type='transporter'),
 * preserve that granularity by checking the permission that matches the row's type.
 */
function requiredPermFor(type: string, action: 'add' | 'edit' | 'delete' = 'edit') {
  // Transporters keep their own single permission; regular parties split into add/edit/delete.
  if (type === 'transporter') return 'edit_transporters' as const;
  return (action === 'add' ? 'add_parties' : action === 'delete' ? 'delete_parties' : 'edit_parties') as const;
}

partiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type as string | undefined;
    // The debtor/creditor master needs view_parties. But transporters and handling agents are
    // needed to fill the dispatch form, so a dispatch-only user (dispatch_order) may load those two
    // lists without full Party Master access.
    const isDispatchList = type === 'transporter' || type === 'handling';
    const allowed =
      hasPermission(req.user!.role, req.user!.permissions, 'view_parties') ||
      (isDispatchList && hasPermission(req.user!.role, req.user!.permissions, 'dispatch_order'));
    if (!allowed) throw new ForbiddenError('Missing permission: view_parties');
    // A party of type 'both' is a debtor AND a creditor, so it must appear when
    // either list is requested. Transporter/handling stay exact-match.
    let where: { type?: string | { in: string[] } } | undefined;
    if (type === 'debtor') where = { type: { in: ['debtor', 'both'] } };
    else if (type === 'creditor') where = { type: { in: ['creditor', 'both'] } };
    else if (type) where = { type };
    const parties = await prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json(parties.map(toPartyDTO));
  })
);

partiesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = partySchema.parse(req.body);
    if (!hasPermission(req.user!.role, req.user!.permissions, requiredPermFor(input.type, 'add'))) {
      throw new ForbiddenError(`Missing permission: ${requiredPermFor(input.type, 'add')}`);
    }
    // No duplicate party names (case-insensitive) — prevents two "Ambica" etc.
    const dup = await prisma.party.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } });
    if (dup) throw new HttpError(409, `A party named "${dup.name}" already exists`);
    const party = await prisma.party.create({ data: input });
    await logActivity(prisma, req.user!, 'create', 'party', party.id, `Party added: ${party.name}`);
    res.status(201).json(toPartyDTO(party));
  })
);

partiesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = partySchema.partial().parse(req.body);
    const existing = await prisma.party.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Party not found');
    if (input.name) {
      const dup = await prisma.party.findFirst({
        where: { name: { equals: input.name, mode: 'insensitive' }, id: { not: req.params.id } },
      });
      if (dup) throw new HttpError(409, `A party named "${dup.name}" already exists`);
    }
    const requiredPerm = requiredPermFor(input.type ?? existing.type, 'edit');
    if (!hasPermission(req.user!.role, req.user!.permissions, requiredPerm)) {
      throw new ForbiddenError(`Missing permission: ${requiredPerm}`);
    }
    const party = await prisma.party.update({ where: { id: req.params.id }, data: input });
    res.json(toPartyDTO(party));
  })
);

partiesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.party.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Party not found');
    const requiredPerm = requiredPermFor(existing.type, 'delete');
    if (!hasPermission(req.user!.role, req.user!.permissions, requiredPerm)) {
      throw new ForbiddenError(`Missing permission: ${requiredPerm}`);
    }

    let result;
    try {
      result = await mutateOrQueue({
        user: req.user!,
        kind: 'delete',
        target: 'party',
        targetId: existing.id,
        payload: { id: existing.id },
        label: `Party: ${existing.name}`,
        execute: () => prisma.party.delete({ where: { id: existing.id } }),
      });
    } catch (e) {
      // Foreign-key violation → the party is still referenced by orders / purchases / payments.
      if ((e as { code?: string }).code === 'P2003') {
        throw new HttpError(409, `Cannot delete "${existing.name}" — it has linked orders, purchases, or payments. Remove or reassign those first.`);
      }
      throw e;
    }

    if (result.executed) res.status(204).end();
    else res.status(202).json({ queued: true });
  })
);
