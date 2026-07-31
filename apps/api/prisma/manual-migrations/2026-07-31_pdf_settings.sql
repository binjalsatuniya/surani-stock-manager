-- =====================================================================
-- PDF Layout settings — stores the editable header/address/footer/colour
-- for the generated PDFs (Party Ledger, Outstanding Dues, Expense Ledger).
-- Managed by the primary Super Admin in the "PDF Layout" tab.
--
-- SAFETY:
--   * Idempotent — CREATE TABLE IF NOT EXISTS. Running twice does nothing.
--   * Additive — creates ONE new table. Does not touch any existing table,
--     column, or row. No data is read, changed, or deleted.
--
-- HOW TO RUN (production, Neon):
--   1. Open the Neon SQL Editor.
--   2. Paste this whole file and Run.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pdf_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Verify:
SELECT to_regclass('public.pdf_settings') AS pdf_settings_table;
