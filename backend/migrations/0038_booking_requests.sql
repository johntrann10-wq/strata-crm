DO $$ BEGIN
  CREATE TYPE booking_request_status AS ENUM (
    'submitted_request',
    'under_review',
    'approved_requested_slot',
    'awaiting_customer_selection',
    'confirmed',
    'declined',
    'customer_requested_new_time',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_request_flexibility AS ENUM (
    'exact_time_only',
    'same_day_flexible',
    'any_nearby_slot'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_request_owner_review_status AS ENUM (
    'pending',
    'approved_requested_slot',
    'proposed_alternates',
    'requested_new_time',
    'declined'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE booking_request_customer_response_status AS ENUM (
    'pending',
    'accepted_requested_slot',
    'accepted_alternate_slot',
    'requested_new_time',
    'declined',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE booking_drafts
  ADD COLUMN IF NOT EXISTS requested_time_end timestamptz,
  ADD COLUMN IF NOT EXISTS requested_time_label text,
  ADD COLUMN IF NOT EXISTS flexibility booking_request_flexibility NOT NULL DEFAULT 'same_day_flexible',
  ADD COLUMN IF NOT EXISTS customer_timezone text;

CREATE TABLE IF NOT EXISTS booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  draft_id uuid REFERENCES booking_drafts(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  status booking_request_status NOT NULL DEFAULT 'submitted_request',
  owner_review_status booking_request_owner_review_status NOT NULL DEFAULT 'pending',
  customer_response_status booking_request_customer_response_status NOT NULL DEFAULT 'pending',
  service_mode text DEFAULT 'in_shop',
  addon_service_ids text NOT NULL DEFAULT '[]',
  service_summary text,
  requested_date text,
  requested_time_start timestamptz,
  requested_time_end timestamptz,
  requested_time_label text,
  customer_timezone text,
  flexibility booking_request_flexibility NOT NULL DEFAULT 'same_day_flexible',
  owner_response_message text,
  customer_response_message text,
  alternate_slot_options text NOT NULL DEFAULT '[]',
  client_first_name text,
  client_last_name text,
  client_email text,
  client_phone text,
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
  public_token_version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  under_review_at timestamptz,
  owner_responded_at timestamptz,
  approved_requested_slot_at timestamptz,
  customer_responded_at timestamptz,
  confirmed_at timestamptz,
  declined_at timestamptz,
  expired_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_requests_business_status_created_idx
  ON booking_requests (business_id, status, created_at);

CREATE INDEX IF NOT EXISTS booking_requests_client_created_idx
  ON booking_requests (business_id, client_id, created_at);
