-- Live roles: a user's permissions become the role's set, plus that person's own exceptions.
--
-- users.permissions currently holds a FULL copy of all permissions, snapshotted from the role when
-- the user was created — which is why editing a role changes nobody. This adds a second column for
-- the exceptions only. Effective access = the role's permissions, overridden by this.
--
-- The existing users.permissions column is deliberately left untouched: it is the record of what
-- everyone could do before the change, so the conversion can be checked and, if necessary, undone.
--
-- NULL means "not converted yet" and is treated as no exceptions.
--
-- Idempotent — safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_overrides jsonb;

COMMENT ON COLUMN users.permission_overrides IS
  'Per-user exceptions to their role''s permissions. NULL = none. See users.permissions for the pre-conversion snapshot.';
