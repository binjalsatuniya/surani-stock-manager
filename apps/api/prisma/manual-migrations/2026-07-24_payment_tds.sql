-- Add TDS (Tax Deducted at Source) to payments.
--
-- `amount` stays the CASH that actually changed hands. The new `tds_amount` is the tax deducted
-- at source. The value that SETTLES invoices and moves a party's balance is (amount + tds_amount).
--
-- Additive and safe: one new column with a default of 0, so every existing payment keeps its
-- current behaviour (0 TDS => settlement value == amount, exactly as before). No data is changed.
--
-- Run this once in Neon (take a Backup first: app -> Backup -> Download).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS tds_amount numeric(14,2) NOT NULL DEFAULT 0;
