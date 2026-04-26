CREATE TABLE IF NOT EXISTS "notification_push_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" text NOT NULL DEFAULT 'ios',
  "device_token" text NOT NULL,
  "app_bundle_id" text NOT NULL DEFAULT 'app.stratacrm.mobile',
  "enabled" boolean NOT NULL DEFAULT true,
  "enabled_buckets" text NOT NULL DEFAULT '["leads","calendar","finance"]',
  "authorization_status" text,
  "last_registered_at" timestamp with time zone,
  "last_delivered_at" timestamp with time zone,
  "last_failed_at" timestamp with time zone,
  "failure_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_push_devices_business_user_token_unique"
  ON "notification_push_devices" ("business_id", "user_id", "device_token");

CREATE INDEX IF NOT EXISTS "notification_push_devices_business_id_idx"
  ON "notification_push_devices" ("business_id");

CREATE INDEX IF NOT EXISTS "notification_push_devices_user_id_idx"
  ON "notification_push_devices" ("user_id");

CREATE INDEX IF NOT EXISTS "notification_push_devices_enabled_idx"
  ON "notification_push_devices" ("enabled");
