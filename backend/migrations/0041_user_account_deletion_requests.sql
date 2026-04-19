ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_token_version integer NOT NULL DEFAULT 1;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_deletion_requested_at timestamptz;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_deletion_request_note text;
