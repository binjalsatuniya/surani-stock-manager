import { Router } from 'express';
import { z } from 'zod';
import { WHATSAPP_TEMPLATES, defaultWhatsappTemplate, type WhatsappTemplateKey } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';

export const whatsappRouter = Router();
whatsappRouter.use(authenticate);

const TEMPLATE_KEYS = WHATSAPP_TEMPLATES.map((t) => t.key) as [WhatsappTemplateKey, ...WhatsappTemplateKey[]];
const keyParam = z.enum(TEMPLATE_KEYS);

whatsappRouter.get(
  '/',
  requirePermission('send_whatsapp'),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.whatsappTemplate.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r.template]));
    res.json(
      WHATSAPP_TEMPLATES.map((t) => ({ key: t.key, template: byKey.get(t.key) ?? t.default }))
    );
  })
);

whatsappRouter.patch(
  '/:key',
  requirePermission('send_whatsapp'),
  asyncHandler(async (req, res) => {
    const key = keyParam.parse(req.params.key);
    const { template } = z.object({ template: z.string().min(1) }).parse(req.body);
    const row = await prisma.whatsappTemplate.upsert({
      where: { key },
      create: { key, template },
      update: { template },
    });
    res.json({ key: row.key, template: row.template });
  })
);

whatsappRouter.post(
  '/:key/reset',
  requirePermission('send_whatsapp'),
  asyncHandler(async (req, res) => {
    const key = keyParam.parse(req.params.key);
    await prisma.whatsappTemplate.deleteMany({ where: { key } });
    res.json({ key, template: defaultWhatsappTemplate(key) });
  })
);
