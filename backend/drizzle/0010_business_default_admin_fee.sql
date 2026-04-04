ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "default_admin_fee" numeric(12, 2) DEFAULT '0';

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "default_admin_fee_enabled" boolean DEFAULT false;
