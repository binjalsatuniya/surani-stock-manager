-- Order Book: store an optional reason/note when an order is cancelled.
-- Idempotent — safe to run more than once.

ALTER TABLE outward ADD COLUMN IF NOT EXISTS cancel_note text;
