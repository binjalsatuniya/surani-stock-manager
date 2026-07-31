import { Router } from 'express';
import { z } from 'zod';
import { PDF_SETTINGS, defaultPdfLayout, type PdfLayout, type PdfSettingKey } from '@surani/shared';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { HttpError } from '../../middleware/errorHandler';

export const pdfSettingsRouter = Router();
pdfSettingsRouter.use(authenticate);

const KEYS = PDF_SETTINGS.map((s) => s.key) as [PdfSettingKey, ...PdfSettingKey[]];
const keyParam = z.enum(KEYS);

// Merge saved values over the defaults. Resilient: if the pdf_settings table doesn't exist yet
// (migration not run), fall back to defaults so PDFs keep working instead of erroring.
async function currentLayout(): Promise<PdfLayout> {
  const layout = defaultPdfLayout();
  try {
    const rows = await prisma.pdfSetting.findMany();
    for (const r of rows) {
      if (r.key in layout) (layout as Record<string, string>)[r.key] = r.value;
    }
  } catch (err) {
    console.error('[pdf-settings] read failed, using defaults (run the pdf_settings migration?):', err);
  }
  return layout;
}

// READ — any signed-in user (the PDF export needs it). WRITE — primary Super Admin only.
pdfSettingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await currentLayout());
  })
);

function requirePrimary(req: { user?: { isPrimary?: boolean } }) {
  if (!req.user?.isPrimary) throw new HttpError(403, 'Only the main Super Admin can change the PDF layout');
}

pdfSettingsRouter.patch(
  '/:key',
  asyncHandler(async (req, res) => {
    requirePrimary(req);
    const key = keyParam.parse(req.params.key);
    const { value } = z.object({ value: z.string() }).parse(req.body);
    try {
      await prisma.pdfSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    } catch (err) {
      console.error('[pdf-settings] write failed:', err);
      throw new HttpError(500, 'Could not save — the pdf_settings table may be missing. Run the migration in Neon.');
    }
    res.json(await currentLayout());
  })
);

pdfSettingsRouter.post(
  '/:key/reset',
  asyncHandler(async (req, res) => {
    requirePrimary(req);
    const key = keyParam.parse(req.params.key);
    await prisma.pdfSetting.deleteMany({ where: { key } });
    res.json(await currentLayout());
  })
);
