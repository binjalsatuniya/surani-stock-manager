-- Per-item default GST slab (%). Auto-fills GST on order / inward entries.
-- Additive and safe: one column, default 0. Idempotent. Run once in Neon (Backup first).

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS gst_pct numeric(5,2) NOT NULL DEFAULT 0;
