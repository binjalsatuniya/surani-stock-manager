-- Mark a sales-person expense as Paid (reimbursed) — with the date it was paid.
--
-- `paid` = has the company reimbursed this expense to the sales person yet.
-- `paid_at` = when it was marked paid (null while unpaid).
--
-- Additive and safe: two new columns, default unpaid, no existing data changed.
-- Idempotent. Run once in Neon (take a Backup first).

ALTER TABLE public.salesperson_expenses
  ADD COLUMN IF NOT EXISTS paid    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;
