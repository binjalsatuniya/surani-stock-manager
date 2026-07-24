-- Add per-user UI preferences (currently: the drag-to-reorder Dashboard layout).
--
-- Stores each user's chosen order of the Dashboard tiles and sections, so the layout
-- follows them across devices. Shape: { "dashboard": { "tiles": [...], "sections": [...] } }.
--
-- Additive and safe: one new column, default empty object, no existing data changed.
-- Idempotent (IF NOT EXISTS). Run once in Neon (take a Backup first).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
