import { Router } from 'express';
import { hasPermission } from '@surani/shared';
import { env } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { authenticate } from '../../middleware/auth';
import { ForbiddenError, HttpError } from '../../middleware/errorHandler';

/**
 * GST number lookup — fetches a taxpayer's registered name and address from GSTINCheck.
 *
 * This lives on the server for one reason: the API key. Anything shipped inside the website or the
 * desktop app can be read out of the bundle, so the key never leaves this process — the browser
 * asks us, and we ask the provider.
 *
 * Appyflow was tried first and rejected: it answered a request for a Gujarat GSTIN with its own
 * sample record ("AppyFlow Technologies", Ludhiana) under a different GSTIN, and with no error
 * flag, so nothing in the response marked it as fake. GSTINCheck returns genuine records.
 *
 * The key is optional. Without it this endpoint reports "not configured" and the web form hides
 * its Fetch button, so an unconfigured server behaves exactly as it did before.
 */
export const gstRouter = Router();
gstRouter.use(authenticate);

/** The live server's .env still names this APPYFLOW_KEY; both are accepted. */
const apiKey = () => env.GST_API_KEY || env.APPYFLOW_KEY || '';

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
    res.json({ configured: !!apiKey() });
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

    const key = apiKey();
    if (!key) {
      throw new HttpError(503, 'GST lookup is not set up on this server (no API key configured).');
    }

    const gstin = String(req.params.gstin || '').trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      throw new HttpError(400, 'That is not a valid GST number.');
    }

    const url = `https://sheet.gstincheck.co.in/check/${encodeURIComponent(key)}/${encodeURIComponent(gstin)}`;

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

    // Failures come back with HTTP 200 and a flag in the body, so check the payload, not the status.
    // A bad key reads "Invalid Key Secret"; running out of credit is reported the same way, and
    // both are worth passing through verbatim rather than reducing to "lookup failed".
    if (payload.error === true || payload.flag === false) {
      const message = typeof payload.message === 'string' ? payload.message : 'GST lookup failed.';
      throw new HttpError(422, message);
    }

    const data = (payload.data ?? payload.taxpayerInfo ?? payload) as Record<string, unknown>;

    // Refuse a record for a different GSTIN. Appyflow did exactly this, and writing another
    // company's registered name and address into a party is worse than not fetching at all.
    const returned = typeof data.gstin === 'string' ? data.gstin.trim().toUpperCase() : '';
    if (returned && returned !== gstin) {
      throw new HttpError(
        422,
        'The lookup service returned details for a different GST number, so they were not used. ' +
          'This usually means the account is on a sample/demo plan — contact the provider.'
      );
    }

    const pradr = (data.pradr ?? {}) as Record<string, unknown>;
    const addr = (pradr.addr ?? {}) as Record<string, string>;

    // The address comes back split into parts; join whatever is present, in postal order.
    const address =
      (typeof pradr.adr === 'string' && pradr.adr.trim() ? pradr.adr.trim() : '') ||
      [addr.flno, addr.bno, addr.bnm, addr.st, addr.loc, addr.city, addr.dst, addr.stcd, addr.pncd]
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
