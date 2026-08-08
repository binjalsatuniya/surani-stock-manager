-- Order Book: attach a scanned invoice PDF/image to an order (added at dispatch).
-- Idempotent — safe to run more than once.

ALTER TABLE outward ADD COLUMN IF NOT EXISTS invoice_file text;
ALTER TABLE outward ADD COLUMN IF NOT EXISTS invoice_file_name text;
