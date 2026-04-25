ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_subject text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_email text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS apple_email_is_private_relay boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_apple_subject_unique
  ON users (apple_subject);
