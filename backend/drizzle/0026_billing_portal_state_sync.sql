ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_has_payment_method boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS billing_payment_method_added_at timestamptz;
