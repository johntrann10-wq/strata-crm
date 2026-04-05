DO $$ BEGIN
  CREATE TYPE integration_provider AS ENUM (
    'quickbooks_online',
    'twilio_sms',
    'google_calendar',
    'outbound_webhooks'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE integration_owner_type AS ENUM ('business', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE integration_connection_status AS ENUM (
    'pending',
    'connected',
    'action_required',
    'error',
    'disconnected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE integration_job_status AS ENUM (
    'pending',
    'processing',
    'succeeded',
    'failed',
    'dead_letter'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  owner_type integration_owner_type NOT NULL DEFAULT 'business',
  owner_key text NOT NULL,
  status integration_connection_status NOT NULL DEFAULT 'pending',
  display_name text,
  external_account_id text,
  external_account_name text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  encrypted_config text,
  scopes text NOT NULL DEFAULT '[]',
  feature_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_successful_at timestamptz,
  last_error text,
  action_required text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_provider_owner_unique
  ON integration_connections (business_id, provider, owner_key);

CREATE TABLE IF NOT EXISTS integration_sync_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  external_id text NOT NULL,
  external_secondary_id text,
  fingerprint text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_links_connection_entity_unique
  ON integration_sync_links (connection_id, entity_type, entity_id);

CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_links_connection_external_unique
  ON integration_sync_links (connection_id, entity_type, external_id);

CREATE TABLE IF NOT EXISTS integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  job_type text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL,
  status integration_job_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dead_lettered_at timestamptz,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_jobs_provider_type_idempotency_unique
  ON integration_jobs (business_id, provider, job_type, idempotency_key);

CREATE TABLE IF NOT EXISTS integration_job_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES integration_jobs(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  attempt_number integer NOT NULL,
  status integration_job_status NOT NULL,
  request_snapshot text,
  response_snapshot text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_job_attempts_job_attempt_unique
  ON integration_job_attempts (job_id, attempt_number);
