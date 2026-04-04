ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "subtotal" numeric(12, 2) DEFAULT '0';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT '0';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "tax_amount" numeric(12, 2) DEFAULT '0';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "apply_tax" boolean DEFAULT false;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "admin_fee_rate" numeric(5, 2) DEFAULT '0';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "admin_fee_amount" numeric(12, 2) DEFAULT '0';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "apply_admin_fee" boolean DEFAULT false;
