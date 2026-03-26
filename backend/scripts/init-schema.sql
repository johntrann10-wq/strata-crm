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
  appointment_buffer_minutes integer DEFAULT 15,
  next_invoice_number integer NOT NULL DEFAULT 1,
  onboarding_complete boolean DEFAULT false,
  staff_count integer,
  operating_hours text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  assigned_staff_id uuid REFERENCES staff(id),
  location_id uuid REFERENCES locations(id),
  title text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  status appointment_status NOT NULL DEFAULT 'scheduled',
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

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  vehicle_id uuid REFERENCES vehicles(id),
  appointment_id uuid REFERENCES appointments(id),
  status quote_status NOT NULL DEFAULT 'draft',
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
  channel text NOT NULL,
  recipient text NOT NULL,
  subject text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  error text,
  metadata text,
  retry_count integer NOT NULL DEFAULT 0,
  last_retry_at timestamptz
);

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
