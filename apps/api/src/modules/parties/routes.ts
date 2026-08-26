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

const partyTypeEnum = z.enum(['debtor', 'creditor', 'both', 'transporter', 'handling', 'importer']);

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
  followUpDays: z.coerce.number().int().min(0).nullable().optional(),
});

// Only users with manage_followup may set the Follow-up (days) field. Called from create/update when
// the request actually carries the field, so ordinary party edits by others are unaffected.
function guardFollowUp(req: { user?: { role: string; permissions: unknown } }, input: { followUpDays?: unknown }) {
  if (input.followUpDays === undefined) return;
  if (!hasPermission(req.user!.role as never, req.user!.permissions as never, 'manage_followup')) {
    throw new ForbiddenError('Missing permission: manage_followup');
  }
}

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

/**
 * Importer is a superadmin-only party type. The web form hides the option from everyone else, but
 * that is only a screen: without this check any holder of add_parties could still post one
 * directly. Marking a party as an importer exempts it from the mandatory-GST rule and unlocks the
 * GST % on its purchases, so it must not be self-service.
 *
 * Only the *transition into* importer is restricted — an existing importer stays editable by
 * anyone with edit_parties, otherwise ordinary edits like a phone number would start failing.
 */
function guardImporterType(
  req: { user?: { role?: string } },
  nextType: string | undefined,
  previousType?: string
) {
  if (nextType !== 'importer') return;
  if (previousType === 'importer') return;
  if (req.user?.role === 'superadmin') return;
  throw new ForbiddenError('Only the Super Admin can mark a party as an Importer');
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
    // either list is requested. An importer is a creditor we buy from, so it belongs in the
    // creditor list too (otherwise it could never be picked on Inward). Transporter/handling
    // stay exact-match.
    let where: { type?: string | { in: string[] } } | undefined;
    if (type === 'debtor') where = { type: { in: ['debtor', 'both'] } };
    else if (type === 'creditor') where = { type: { in: ['creditor', 'both', 'importer'] } };
    else if (type) where = { type };
    const parties = await prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json(parties.map(toPartyDTO));
  })
);

// ---- Follow-up list ---------------------------------------------------------
// Which sales person this login IS, from their preferences (set by an admin in User Master). Used to
// scope the Follow-up list so a sales person only sees their own companies.
async function callerSalesPersonId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (u?.preferences as Record<string, unknown>) ?? {};
  const id = prefs.salesPersonId;
  return typeof id === 'string' ? id : null;
}

// The Follow-up tab. Gated by manage_followup (not view_parties), so a sales person who only manages
// follow-ups still loads it. Super Admin sees every company; anyone else sees only the companies
// assigned to the sales person they are linked to.
partiesRouter.get(
  '/followup',
  asyncHandler(async (req, res) => {
    if (!hasPermission(req.user!.role, req.user!.permissions, 'manage_followup')) {
      throw new ForbiddenError('Missing permission: manage_followup');
    }
    const where: { type: { in: string[] }; salesPersonId?: string | null } = {
      type: { in: ['debtor', 'creditor', 'both'] },
    };
    if (req.user!.role !== 'superadmin') {
      // A linked sales person sees only theirs; an unlinked non-super user sees nothing.
      where.salesPersonId = (await callerSalesPersonId(req.user!.id)) ?? '__none__';
    }
    const parties = await prisma.party.findMany({ where, orderBy: { name: 'asc' } });
    res.json(parties.map(toPartyDTO));
  })
);

// Set the follow-up days on one company. Super Admin may set any; a linked sales person may set it
// only on their own companies. Kept separate from the general party edit so it needs no edit_parties.
partiesRouter.patch(
  '/:id/followup',
  asyncHandler(async (req, res) => {
    if (!hasPermission(req.user!.role, req.user!.permissions, 'manage_followup')) {
      throw new ForbiddenError('Missing permission: manage_followup');
    }
    const { followUpDays } = z.object({ followUpDays: z.coerce.number().int().min(0).nullable() }).parse(req.body);
    const party = await prisma.party.findUnique({ where: { id: req.params.id } });
    if (!party) throw new NotFoundError('Party not found');
    if (req.user!.role !== 'superadmin') {
      const mine = await callerSalesPersonId(req.user!.id);
      if (!mine || party.salesPersonId !== mine) {
        throw new ForbiddenError('You can only set follow-ups for your own companies.');
      }
    }
    const updated = await prisma.party.update({ where: { id: party.id }, data: { followUpDays } });
    res.json(toPartyDTO(updated));
  })
);

partiesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = partySchema.parse(req.body);
    if (!hasPermission(req.user!.role, req.user!.permissions, requiredPermFor(input.type, 'add'))) {
      throw new ForbiddenError(`Missing permission: ${requiredPermFor(input.type, 'add')}`);
    }
    guardImporterType(req, input.type);
    guardFollowUp(req, input);
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
    guardImporterType(req, input.type, existing.type);
    guardFollowUp(req, input);
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
