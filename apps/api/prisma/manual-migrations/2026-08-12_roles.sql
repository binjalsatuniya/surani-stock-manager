-- Custom roles: named permission templates, e.g. "Warehouse" or "Sales Office".
--
-- These are templates only. A role's tick-boxes pre-fill a user's permissions when the role is
-- assigned; from then on the user carries their own set, exactly as today. Nothing about how
-- permissions are CHECKED changes, so no existing user's access is affected by this table.
--
-- users.role is already a plain text column, so a custom role name can be stored in it without
-- altering the users table.
--
-- Idempotent — safe to run more than once.

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Role names are matched case-insensitively so "Warehouse" and "warehouse" cannot both exist.
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_lower_key ON roles (lower(name));
