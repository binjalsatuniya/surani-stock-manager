-- Remove duplicate role rows (same name, case-insensitive) and stop new ones being created.
-- Users store their role by NAME, so deleting a duplicate row never orphans anyone — the remaining
-- row of that name still matches. Keep the oldest row of each name.
-- Idempotent: safe to re-run.

-- 1) Delete the newer duplicate(s), keeping the earliest created_at per name.
DELETE FROM roles a
USING roles b
WHERE lower(a.name) = lower(b.name)
  AND a.created_at > b.created_at;

-- 2) Break any created_at ties by keeping the smaller id.
DELETE FROM roles a
USING roles b
WHERE lower(a.name) = lower(b.name)
  AND a.created_at = b.created_at
  AND a.id > b.id;

-- 3) Enforce case-insensitive uniqueness so duplicates can't come back.
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_lower_unique ON roles (lower(name));
