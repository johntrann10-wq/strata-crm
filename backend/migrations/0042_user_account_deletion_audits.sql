ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS account_deletion_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_user_id uuid NOT NULL,
  email_hash text NOT NULL,
  email_domain text,
  auth_providers text NOT NULL DEFAULT '[]',
  owned_business_count integer NOT NULL DEFAULT 0,
  business_membership_count integer NOT NULL DEFAULT 0,
  linked_staff_profile_count integer NOT NULL DEFAULT 0,
  retained_data_summary text NOT NULL DEFAULT '[]',
  deletion_mode text NOT NULL,
  requested_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_audits_deleted_user_unique
  ON account_deletion_audits (deleted_user_id);
