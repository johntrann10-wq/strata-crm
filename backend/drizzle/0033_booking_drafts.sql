DO $$ BEGIN
  CREATE TYPE booking_draft_status AS ENUM (
    'anonymous_draft',
    'identified_lead',
    'qualified_booking_intent',
    'submitted_request',
    'confirmed_booking'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS booking_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  resume_token text NOT NULL,
  status booking_draft_status NOT NULL DEFAULT 'anonymous_draft',
  addon_service_ids text NOT NULL DEFAULT '[]',
  service_mode text DEFAULT 'in_shop',
  booking_date text,
  start_time timestamptz,
  first_name text,
  last_name text,
  email text,
  phone text,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  service_address text,
  service_city text,
  service_state text,
  service_zip text,
  notes text,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  source text,
  campaign text,
  current_step integer NOT NULL DEFAULT 0,
  service_category_filter text,
  expanded_service_id text,
  identified_at timestamptz,
  qualified_at timestamptz,
  abandoned_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  last_client_event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_drafts_resume_token_unique
  ON booking_drafts (resume_token);
