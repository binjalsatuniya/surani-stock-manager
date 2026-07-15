import { Router } from 'express';
import { z } from 'zod';
import { FIELD_SETTINGS, effectiveFieldSettings, type FieldSettingsMap } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';

export const fieldSettingsRouter = Router();
fieldSettingsRouter.use(authenticate);

const VALID_KEYS = new Set(FIELD_SETTINGS.map((f) => f.key));

// Everyone needs to read the rules (so their forms enforce them); only superadmin can change them.
fieldSettingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.fieldSetting.findMany();
    const overrides: FieldSettingsMap = {};
    for (const r of rows) overrides[r.key] = r.required;
    res.json(effectiveFieldSettings(overrides));
  })
);

fieldSettingsRouter.patch(
  '/:key',
  requireRole('superadmin'),
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!VALID_KEYS.has(key as never)) {
      res.status(404).json({ message: `Unknown field: ${key}` });
      return;
    }
    const { required } = z.object({ required: z.boolean() }).parse(req.body);
    await prisma.fieldSetting.upsert({
      where: { key },
      create: { key, required },
      update: { required },
    });
    const rows = await prisma.fieldSetting.findMany();
    const overrides: FieldSettingsMap = {};
    for (const r of rows) overrides[r.key] = r.required;
    res.json(effectiveFieldSettings(overrides));
  })
);
