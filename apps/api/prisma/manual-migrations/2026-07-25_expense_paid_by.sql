-- Record WHO paid a sales-person expense and by WHICH payment mode (Cash / bank account).
-- Additive and safe: two nullable text columns. Idempotent. Run once in Neon (Backup first).

ALTER TABLE public.salesperson_expenses
  ADD COLUMN IF NOT EXISTS paid_by   text,
  ADD COLUMN IF NOT EXISTS paid_mode text;
