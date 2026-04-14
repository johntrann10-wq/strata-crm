CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 0,
  "reset_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "appointments"
ADD COLUMN IF NOT EXISTS "public_token_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "public_token_version" integer NOT NULL DEFAULT 1;

ALTER TABLE "quotes"
ADD COLUMN IF NOT EXISTS "public_token_version" integer NOT NULL DEFAULT 1;
