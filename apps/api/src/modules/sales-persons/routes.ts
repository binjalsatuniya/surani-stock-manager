import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { toSalesPersonDTO } from '../../lib/serializeMasters';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { NotFoundError } from '../../middleware/errorHandler';

export const salesPersonsRouter = Router();
salesPersonsRouter.use(authenticate);

const salesPersonSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
});

salesPersonsRouter.get(
  '/',
  requirePermission('view_parties'),
  asyncHandler(async (_req, res) => {
    const salesPersons = await prisma.salesPerson.findMany({ orderBy: { name: 'asc' } });
    res.json(salesPersons.map(toSalesPersonDTO));
  })
);

salesPersonsRouter.post(
  '/',
  requirePermission('edit_salespersons'),
  asyncHandler(async (req, res) => {
    const input = salesPersonSchema.parse(req.body);
    const salesPerson = await prisma.salesPerson.create({ data: input });
    res.status(201).json(toSalesPersonDTO(salesPerson));
  })
);

salesPersonsRouter.patch(
  '/:id',
  requirePermission('edit_salespersons'),
  asyncHandler(async (req, res) => {
    const input = salesPersonSchema.partial().parse(req.body);
    const existing = await prisma.salesPerson.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Sales person not found');
    const salesPerson = await prisma.salesPerson.update({ where: { id: req.params.id }, data: input });
    res.json(toSalesPersonDTO(salesPerson));
  })
);

salesPersonsRouter.delete(
  '/:id',
  requirePermission('edit_salespersons'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.salesPerson.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Sales person not found');
    await prisma.salesPerson.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
