ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded_at timestamptz;
