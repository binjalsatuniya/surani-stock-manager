-- Trip closing: a trip can be marked paid / closed once settled. Idempotent; run after `git pull`:
--   sudo -u postgres psql -d surani < apps/api/prisma/manual-migrations/2026-08-20_trip_closed.sql
--   sudo -u postgres psql -d surani -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO surani;"

ALTER TABLE expense_trips ADD COLUMN IF NOT EXISTS closed_at timestamptz;

GRANT ALL ON expense_trips TO surani;
