-- Push notifications: store each device's Expo/FCM push token so the server can notify users.
-- Idempotent — safe to run more than once.

CREATE TABLE IF NOT EXISTS push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_key ON push_tokens (token);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens (user_id);
