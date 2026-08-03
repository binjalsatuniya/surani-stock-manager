-- =====================================================================
-- Item TDS (Technical Data Sheet) attachment.
-- Two columns on items to store an attached spec sheet (PDF/image) and its
-- file name, so it can be shared with a party on WhatsApp.
--
-- SAFETY: idempotent (ADD COLUMN IF NOT EXISTS), additive only. No data is
-- read, changed, or deleted; no existing column/table is altered.
--
-- HOW TO RUN (Neon): open the SQL Editor, paste this file, Run.
-- =====================================================================

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS tds_attachment      text,
  ADD COLUMN IF NOT EXISTS tds_attachment_name text;

-- Verify:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'items'
  AND column_name IN ('tds_attachment', 'tds_attachment_name');
