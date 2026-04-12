ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS billing_access_state text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_setup_error text,
  ADD COLUMN IF NOT EXISTS billing_setup_failed_at timestamptz;
