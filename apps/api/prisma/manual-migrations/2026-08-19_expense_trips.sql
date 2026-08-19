-- Expense Trips: a named trip that field/travel expenses can be tagged with, so spend can be
-- grouped and totalled per trip. Safe to run more than once (idempotent).
--
-- Run AFTER `git pull` on the server (the file doesn't exist there until the deploy pulls it), then:
--   sudo -u postgres psql -d surani < apps/api/prisma/manual-migrations/2026-08-19_expense_trips.sql
--   sudo -u postgres psql -d surani -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO surani;"

CREATE TABLE IF NOT EXISTS expense_trips (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  note       text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE salesperson_expenses ADD COLUMN IF NOT EXISTS trip_id uuid;

-- Link expenses to a trip; if a trip is deleted, its expenses simply lose the tag (SET NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salesperson_expenses_trip_id_fkey'
  ) THEN
    ALTER TABLE salesperson_expenses
      ADD CONSTRAINT salesperson_expenses_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES expense_trips(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS salesperson_expenses_trip_id_idx ON salesperson_expenses (trip_id);

GRANT ALL ON expense_trips TO surani;
