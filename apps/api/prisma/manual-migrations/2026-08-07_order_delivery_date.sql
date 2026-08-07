-- Order Book: a planned/expected delivery date, chosen when placing a new order.
-- Idempotent — safe to run more than once.

ALTER TABLE outward ADD COLUMN IF NOT EXISTS delivery_date date;
