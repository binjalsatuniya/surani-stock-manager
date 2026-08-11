import { Router } from 'express';
import { hasPermission } from '@surani/shared';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError, HttpError } from '../../middleware/errorHandler';

/**
 * GST number lookup — fetches a taxpayer's registered name and address from Appyflow.
 *
 * This lives on the server for one reason: the API key. Anything shipped inside the website or
 * the desktop app can be read out of the bundle, so the key never leaves this process — the
 * browser asks us, and we ask Appyflow.
 *
 * The key is optional. Without it this endpoint reports "not configured" and the web form hides
 * its Fetch button, so an unconfigured server behaves exactly as it did before.
 */
export const gstRouter = Router();
gstRouter.use(authenticate);

const ENDPOINT = 'https://appyflow.in/api/verifyGST';

export interface GstLookupResult {
  gstin: string;
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  status: string | null;
  registrationDate: string | null;
  businessType: string | null;
}

/** Tells the web app whether the Fetch button should appear at all. */
gstRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ configured: !!env.APPYFLOW_KEY });
  })
);

gstRouter.get(
  '/lookup/:gstin',
  asyncHandler(async (req, res) => {
    // Anyone who may create or amend a party may look one up.
    const allowed =
      hasPermission(req.user!.role, req.user!.permissions, 'add_parties') ||
      hasPermission(req.user!.role, req.user!.permissions, 'edit_parties');
    if (!allowed) throw new ForbiddenError('Missing permission: add_parties');

    if (!env.APPYFLOW_KEY) {
      throw new HttpError(503, 'GST lookup is not set up on this server (APPYFLOW_KEY is missing).');
    }

    const gstin = String(req.params.gstin || '').trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      throw new HttpError(400, 'That is not a valid GST number.');
    }

    const url = `${ENDPOINT}?gstNo=${encodeURIComponent(gstin)}&key_secret=${encodeURIComponent(env.APPYFLOW_KEY)}`;

    let payload: Record<string, unknown>;
    try {
      // Don't let a slow third party hold a request open indefinitely.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      payload = (await resp.json()) as Record<string, unknown>;
    } catch (err) {
      console.error('[gst] lookup failed:', err);
      throw new HttpError(502, 'Could not reach the GST lookup service. Try again, or type the details in.');
    }

    // Appyflow reports its own failures in the body with a 200, so check the payload, not the status.
    if (payload.error) {
      const message = typeof payload.message === 'string' ? payload.message : 'GST lookup failed.';
      // Out of credits is worth naming plainly — otherwise it looks like a broken feature.
      throw new HttpError(422, message);
    }

    const data = (payload.taxpayerInfo ?? payload) as Record<string, unknown>;
    const pradr = (data.pradr ?? {}) as Record<string, unknown>;
    const addr = (pradr.addr ?? {}) as Record<string, string>;

    // Appyflow returns the address split into parts; join whatever is present, in postal order.
    const address =
      (typeof pradr.adr === 'string' && pradr.adr) ||
      [addr.bno, addr.bnm, addr.st, addr.loc, addr.dst, addr.stcd, addr.pncd]
        .filter((p) => typeof p === 'string' && p.trim())
        .join(', ') ||
      null;

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    const result: GstLookupResult = {
      gstin,
      legalName: str(data.lgnm),
      tradeName: str(data.tradeNam),
      address,
      status: str(data.sts),
      registrationDate: str(data.rgdt),
      businessType: str(data.ctb),
    };

    if (!result.legalName && !result.tradeName && !result.address) {
      throw new HttpError(404, 'No details found for that GST number.');
    }
    res.json(result);
  })
);
