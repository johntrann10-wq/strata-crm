ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_type text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_event_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_sync_status text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_last_stripe_sync_error text;

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
