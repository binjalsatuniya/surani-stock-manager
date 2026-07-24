-- =====================================================================
-- COMBINED migration — all pending database changes, in one run.
--
-- Contains every DB change the current app code expects that may not yet be
-- on the live (Neon) database:
--   1) payment_inward_allocations   — table for paid-side invoice allocation
--   2) payments.tds_amount          — TDS (Tax Deducted at Source) on payments
--   3) (optional) make JAYNIL the primary Super Admin  — DATA only
--
-- SAFETY:
--   * Idempotent — every step uses IF NOT EXISTS / is a plain value update,
--     so running this twice does nothing harmful.
--   * Additive — it creates one table and one column. It does NOT drop or
--     alter any existing table, column, or business row.
--   * Wrapped in a single transaction: if anything fails, NOTHING is applied.
--
-- HOW TO RUN (production, Neon):
--   1. Take a Backup first (app -> Backup -> Download Backup).
--   2. Open the Neon SQL Editor, paste this WHOLE file, and Run.
--   3. Read the two result tables at the end to confirm.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Paid-side invoice allocation
--    Lets an outgoing payment (dir = 'out') be allocated to specific
--    creditor PURCHASE (inward) invoices, mirroring payment_allocations
--    for incoming payments against sales (outward) invoices.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_inward_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  inward_id  uuid NOT NULL REFERENCES public.inward(id)   ON DELETE CASCADE,
  amount     numeric(14,2) NOT NULL,
  CONSTRAINT payment_inward_allocations_payment_inward_key UNIQUE (payment_id, inward_id)
);

CREATE INDEX IF NOT EXISTS payment_inward_allocations_inward_id_idx
  ON public.payment_inward_allocations(inward_id);

-- ---------------------------------------------------------------------
-- 2) TDS on payments
--    `amount` stays the CASH that actually changed hands. `tds_amount` is
--    the tax deducted at source. The value that SETTLES invoices/ledger is
--    (amount + tds_amount). Default 0, so every existing payment is unchanged.
-- ---------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tds_amount numeric(14,2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- 2b) Per-user UI preferences (drag-to-reorder Dashboard layout).
--     Shape: { "dashboard": { "tiles": [...], "sections": [...] } }. Default empty.
-- ---------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 3) (OPTIONAL — DATA ONLY) Make JAYNIL the primary Super Admin.
--    Reveals Access Settings & Login Locations, and shows the name "JAYNIL".
--    Skip this block if you have already run it. Re-running is harmless.
--    NOTE: log out and back in on the app after this takes effect.
-- ---------------------------------------------------------------------
UPDATE public.users SET is_primary = false WHERE is_primary = true AND username <> 'JAYNIL';
UPDATE public.users SET is_primary = true  WHERE username = 'JAYNIL';
UPDATE public.users SET name = 'JAYNIL'    WHERE username = 'JAYNIL';

COMMIT;

-- =====================================================================
-- Verification (read these after running):
-- =====================================================================

-- Confirms the new table and column exist:
SELECT
  to_regclass('public.payment_inward_allocations') AS inward_alloc_table,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'tds_amount'
  ) AS payments_has_tds_amount;

-- Confirms who is primary:
SELECT username, name, role, is_primary
FROM public.users
ORDER BY is_primary DESC, username;
