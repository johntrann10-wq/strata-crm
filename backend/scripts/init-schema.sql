-- Strata DB schema (run with: node scripts/run-init.js)
-- Enums
DO $$ BEGIN
  CREATE TYPE business_type AS ENUM (
    'auto_detailing', 'mobile_detailing', 'wrap_ppf', 'window_tinting',
    'performance', 'mechanic', 'tire_shop', 'muffler_shop'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no-show'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE appointment_job_phase AS ENUM (
    'scheduled', 'active_work', 'waiting', 'curing', 'hold', 'pickup_ready'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'card', 'check', 'venmo', 'cashapp', 'zelle', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE booking_draft_status AS ENUM (
    'anonymous_draft', 'identified_lead', 'qualified_booking_intent', 'submitted_request', 'confirmed_booking'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE integration_provider AS ENUM (
    'quickbooks_online', 'twilio_sms', 'google_calendar', 'outbound_webhooks'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE integration_owner_type AS ENUM ('business', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE integration_connection_status AS ENUM (
    'pending', 'connected', 'action_required', 'error', 'disconnected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE integration_job_status AS ENUM (
    'pending', 'processing', 'succeeded', 'failed', 'dead_letter'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE service_category AS ENUM ('detail', 'tint', 'ppf', 'mechanical', 'tire', 'body', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'manager', 'service_advisor', 'technician');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE permission AS ENUM (
    'dashboard.view',
    'customers.read',
    'customers.write',
    'vehicles.read',
    'vehicles.write',
    'services.read',
    'services.write',
    'quotes.read',
    'quotes.write',
    'appointments.read',
    'appointments.write',
    'jobs.read',
    'jobs.write',
    'invoices.read',
    'invoices.write',
    'payments.read',
    'payments.write',
    'team.read',
    'team.write',
    'settings.read',
    'settings.write'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tables
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text,
  first_name text,
  last_name text,
  email_verified boolean DEFAULT false,
  google_profile_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  type business_type NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  timezone text DEFAULT 'America/New_York',
  currency text DEFAULT 'USD',
  default_tax_rate decimal(5,2) DEFAULT 0,
  default_admin_fee decimal(12,2) DEFAULT 0,
  default_admin_fee_enabled boolean DEFAULT false,
  appointment_buffer_minutes integer DEFAULT 15,
  calendar_block_capacity_per_slot integer DEFAULT 1,
  lead_capture_enabled boolean DEFAULT false,
  lead_auto_response_enabled boolean DEFAULT true,
  lead_auto_response_email_enabled boolean DEFAULT true,
  lead_auto_response_sms_enabled boolean DEFAULT false,
  missed_call_text_back_enabled boolean DEFAULT false,
  automation_uncontacted_leads_enabled boolean DEFAULT false,
  automation_uncontacted_lead_hours integer DEFAULT 2,
  automation_appointment_reminders_enabled boolean DEFAULT true,
  automation_appointment_reminder_hours integer DEFAULT 24,
  automation_send_window_start_hour integer DEFAULT 8,
  automation_send_window_end_hour integer DEFAULT 18,
  automation_review_requests_enabled boolean DEFAULT false,
  automation_review_request_delay_hours integer DEFAULT 24,
  review_request_url text,
  automation_abandoned_quotes_enabled boolean DEFAULT false,
  automation_abandoned_quote_hours integer DEFAULT 48,
  automation_lapsed_clients_enabled boolean DEFAULT false,
  automation_lapsed_client_months integer DEFAULT 6,
  booking_request_url text,
  booking_enabled boolean DEFAULT false,
  booking_default_flow text DEFAULT 'request',
  booking_page_title text,
  booking_page_subtitle text,
  booking_confirmation_message text,
  booking_trust_bullet_primary text,
  booking_trust_bullet_secondary text,
  booking_trust_bullet_tertiary text,
  booking_notes_prompt text,
  booking_brand_logo_url text,
  booking_brand_primary_color_token text DEFAULT 'orange',
  booking_brand_accent_color_token text DEFAULT 'amber',
  booking_brand_background_tone_token text DEFAULT 'ivory',
  booking_brand_button_style_token text DEFAULT 'solid',
  booking_require_email boolean DEFAULT false,
  booking_require_phone boolean DEFAULT false,
  booking_require_vehicle boolean DEFAULT true,
  booking_allow_customer_notes boolean DEFAULT true,
  booking_show_prices boolean DEFAULT true,
  booking_show_durations boolean DEFAULT true,
  booking_available_days text,
  booking_available_start_time text,
  booking_available_end_time text,
  booking_blackout_dates text,
  booking_slot_interval_minutes integer DEFAULT 15,
  booking_buffer_minutes integer,
  booking_capacity_per_slot integer,
  booking_urgency_enabled boolean DEFAULT false,
  booking_urgency_text text,
  integration_webhook_enabled boolean DEFAULT false,
  integration_webhook_url text,
  integration_webhook_secret text,
  integration_webhook_events text DEFAULT '[]',
  next_invoice_number integer NOT NULL DEFAULT 1,
  onboarding_complete boolean DEFAULT false,
  staff_count integer,
  operating_hours text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  billing_access_state text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  billing_has_payment_method boolean DEFAULT false,
  billing_payment_method_added_at timestamptz,
  billing_setup_error text,
  billing_setup_failed_at timestamptz,
  billing_last_stripe_event_id text,
  billing_last_stripe_event_type text,
  billing_last_stripe_event_at timestamptz,
  billing_last_stripe_sync_status text,
  billing_last_stripe_sync_error text,
  stripe_connect_account_id text,
  stripe_connect_details_submitted boolean DEFAULT false,
  stripe_connect_charges_enabled boolean DEFAULT false,
  stripe_connect_payouts_enabled boolean DEFAULT false,
  stripe_connect_onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS default_admin_fee decimal(12,2) DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS default_admin_fee_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS calendar_block_capacity_per_slot integer DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_capture_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_email_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_sms_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS missed_call_text_back_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_uncontacted_leads_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_uncontacted_lead_hours integer DEFAULT 2;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_appointment_reminders_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_appointment_reminder_hours integer DEFAULT 24;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_send_window_start_hour integer DEFAULT 8;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_send_window_end_hour integer DEFAULT 18;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_review_requests_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_review_request_delay_hours integer DEFAULT 24;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS review_request_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_abandoned_quotes_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_abandoned_quote_hours integer DEFAULT 48;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_lapsed_clients_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_lapsed_client_months integer DEFAULT 6;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_request_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_default_flow text DEFAULT 'request';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_page_title text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_page_subtitle text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_confirmation_message text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_primary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_secondary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_tertiary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_notes_prompt text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_email boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_phone boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_vehicle boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_allow_customer_notes boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_show_prices boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_show_durations boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_days text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_start_time text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_end_time text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_blackout_dates text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_slot_interval_minutes integer DEFAULT 15;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_urgency_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS integration_webhook_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS integration_webhook_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS integration_webhook_secret text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS integration_webhook_events text DEFAULT '[]';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_access_state text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_started_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_has_payment_method boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_payment_method_added_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_type text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_sync_status text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_sync_error text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_setup_error text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_setup_failed_at timestamptz;

CREATE TABLE IF NOT EXISTS business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  status membership_status NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  invited_by_user_id uuid REFERENCES users(id),
  invited_at timestamptz,
  joined_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_memberships_business_user_unique
  ON business_memberships (business_id, user_id);

CREATE TABLE IF NOT EXISTS role_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  permission permission NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS role_permission_grants_scope_role_permission_unique
  ON role_permission_grants (business_id, role, permission);

CREATE TABLE IF NOT EXISTS membership_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission permission NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS membership_permission_grants_business_user_permission_unique
  ON membership_permission_grants (business_id, user_id, permission);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  notes text,
  internal_notes text,
  marketing_opt_in boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  make text NOT NULL,
  model text NOT NULL,
  year integer,
  trim text,
  body_style text,
  engine text,
  color text,
  license_plate text,
  vin text,
  display_name text,
  source text,
  source_vehicle_id text,
  mileage integer,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS trim text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS body_style text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS source_vehicle_id text;

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE locations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  user_id uuid REFERENCES users(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  role text DEFAULT 'technician',
  active boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  name text NOT NULL,
  description text,
  price decimal(12,2) DEFAULT 0,
  duration_minutes integer,
  active boolean DEFAULT true,
  booking_enabled boolean DEFAULT false,
  booking_flow_type text DEFAULT 'inherit',
  booking_description text,
  booking_deposit_amount decimal(12,2) DEFAULT 0,
  booking_lead_time_hours integer DEFAULT 0,
  booking_window_days integer DEFAULT 30,
  booking_service_mode text DEFAULT 'in_shop',
  booking_available_days text,
  booking_available_start_time text,
  booking_available_end_time text,
  booking_buffer_minutes integer,
  booking_capacity_per_slot integer,
  booking_featured boolean DEFAULT false,
  booking_hide_price boolean DEFAULT false,
  booking_hide_duration boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'description'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'services'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE services RENAME COLUMN description TO notes;
  END IF;
END $$;

ALTER TABLE services ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS category service_category DEFAULT 'other';
ALTER TABLE services ADD COLUMN IF NOT EXISTS taxable boolean DEFAULT true;
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_addon boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_flow_type text DEFAULT 'inherit';
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_description text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_deposit_amount decimal(12,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_lead_time_hours integer DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_window_days integer DEFAULT 30;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_service_mode text DEFAULT 'in_shop';
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_days text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_start_time text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_end_time text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_featured boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_hide_price boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_hide_duration boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name),
  UNIQUE (business_id, key)
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL;
ALTER TABLE services ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS service_addon_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  parent_service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  addon_service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_addon_links_parent_addon
  ON service_addon_links (parent_service_id, addon_service_id);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid REFERENCES clients(id),
  vehicle_id uuid REFERENCES vehicles(id),
  assigned_staff_id uuid REFERENCES staff(id),
  location_id uuid REFERENCES locations(id),
  title text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  public_token_version integer NOT NULL DEFAULT 1,
  subtotal decimal(12,2) DEFAULT 0,
  tax_rate decimal(5,2) DEFAULT 0,
  tax_amount decimal(12,2) DEFAULT 0,
  apply_tax boolean DEFAULT false,
  admin_fee_rate decimal(5,2) DEFAULT 0,
  admin_fee_amount decimal(12,2) DEFAULT 0,
  apply_admin_fee boolean DEFAULT false,
  total_price decimal(12,2) DEFAULT 0,
  deposit_amount decimal(12,2) DEFAULT 0,
  deposit_paid boolean DEFAULT false,
  notes text,
  internal_notes text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS job_start_time timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS expected_completion_time timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS pickup_ready_time timestamptz;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS vehicle_on_site boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS job_phase appointment_job_phase DEFAULT 'scheduled';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS public_token_version integer NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS subtotal decimal(12,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tax_rate decimal(5,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tax_amount decimal(12,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS apply_tax boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS admin_fee_rate decimal(5,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS admin_fee_amount decimal(12,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS apply_admin_fee boolean DEFAULT false;
ALTER TABLE appointments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN vehicle_id DROP NOT NULL;

UPDATE appointments
SET
  job_start_time = COALESCE(job_start_time, start_time),
  expected_completion_time = COALESCE(expected_completion_time, end_time, start_time),
  job_phase = COALESCE(job_phase, 'scheduled'::appointment_job_phase)
WHERE
  job_start_time IS NULL
  OR expected_completion_time IS NULL
  OR job_phase IS NULL;

ALTER TABLE appointments
  ALTER COLUMN job_phase SET DEFAULT 'scheduled',
  ALTER COLUMN job_phase SET NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  service_id uuid NOT NULL REFERENCES services(id),
  quantity integer DEFAULT 1,
  unit_price decimal(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  appointment_id uuid REFERENCES appointments(id),
  invoice_number text UNIQUE,
  status invoice_status NOT NULL DEFAULT 'draft',
  public_token_version integer NOT NULL DEFAULT 1,
  subtotal decimal(12,2) DEFAULT 0,
  tax_rate decimal(5,2) DEFAULT 0,
  tax_amount decimal(12,2) DEFAULT 0,
  discount_amount decimal(12,2) DEFAULT 0,
  total decimal(12,2) DEFAULT 0,
  due_date timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status invoice_status DEFAULT 'draft';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token_version integer NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal decimal(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate decimal(5,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount decimal(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount decimal(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total decimal(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_unique ON invoices (invoice_number);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  description text NOT NULL,
  quantity decimal(10,2) DEFAULT 1,
  unit_price decimal(12,2) NOT NULL,
  total decimal(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS quantity decimal(10,2) DEFAULT 1;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS unit_price decimal(12,2);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS total decimal(12,2);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  amount decimal(12,2) NOT NULL,
  method payment_method NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  notes text,
  reference_number text,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_charge_id text;

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  expense_date timestamptz NOT NULL,
  vendor text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount decimal(12,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  vehicle_id uuid REFERENCES vehicles(id),
  appointment_id uuid REFERENCES appointments(id),
  status quote_status NOT NULL DEFAULT 'draft',
  public_token_version integer NOT NULL DEFAULT 1,
  subtotal decimal(12,2) DEFAULT 0,
  tax_rate decimal(5,2) DEFAULT 0,
  tax_amount decimal(12,2) DEFAULT 0,
  total decimal(12,2) DEFAULT 0,
  expires_at timestamptz,
  sent_at timestamptz,
  follow_up_sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS public_token_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES quotes(id),
  description text NOT NULL,
  quantity decimal(10,2) DEFAULT 1,
  unit_price decimal(12,2) NOT NULL,
  total decimal(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  user_id uuid REFERENCES users(id),
  metadata text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  integration_job_id uuid,
  channel text NOT NULL,
  recipient text NOT NULL,
  subject text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  provider_status text,
  provider_status_at timestamptz,
  delivered_at timestamptz,
  provider_error_code text,
  error text,
  metadata text,
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz
);

ALTER TABLE IF EXISTS notification_logs
  ADD COLUMN IF NOT EXISTS integration_job_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_provider_message_unique
  ON notification_logs (channel, provider_message_id);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  attempt_count integer NOT NULL DEFAULT 0,
  payload text,
  processed_at timestamptz,
  last_error text,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_id_unique
  ON stripe_webhook_events (event_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  slug text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key text NOT NULL,
  business_id uuid NOT NULL,
  operation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, business_id, operation)
);

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
