-- Follow-up interval (in days) for a company/party — after how many days the sales person should
-- follow up with them. Nullable; only shown/edited by users with the manage_followup permission
-- (JAYNIL only, for now). Idempotent so it is safe to re-run.
ALTER TABLE parties ADD COLUMN IF NOT EXISTS follow_up_days INTEGER;
