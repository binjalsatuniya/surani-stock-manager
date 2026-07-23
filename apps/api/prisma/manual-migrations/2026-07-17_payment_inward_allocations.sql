-- =====================================================================
-- Migration: add payment_inward_allocations
-- Purpose:   let an outgoing payment (dir = 'out') be allocated to specific
--            creditor PURCHASE (inward) invoices, mirroring how payment_allocations
--            ties incoming payments to sales (outward) invoices.
--
-- SAFETY:    Additive only — creates ONE new table. Does NOT alter or delete any
--            existing table, column, or row. Safe to run on the live database.
--            Idempotent (IF NOT EXISTS), so re-running does nothing.
--
-- HOW TO RUN (production, Neon): paste this whole file into the Neon SQL Editor
--            and Run. Take a Backup first (app -> Backup -> Download Backup).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payment_inward_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  inward_id  uuid NOT NULL REFERENCES public.inward(id)   ON DELETE CASCADE,
  amount     numeric(14,2) NOT NULL,
  CONSTRAINT payment_inward_allocations_payment_inward_key UNIQUE (payment_id, inward_id)
);

CREATE INDEX IF NOT EXISTS payment_inward_allocations_inward_id_idx
  ON public.payment_inward_allocations(inward_id);
