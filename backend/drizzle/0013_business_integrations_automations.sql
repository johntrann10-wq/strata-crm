ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "automation_appointment_reminders_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "automation_appointment_reminder_hours" integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "automation_review_requests_enabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "automation_review_request_delay_hours" integer DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "automation_lapsed_clients_enabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "automation_lapsed_client_months" integer DEFAULT 6,
  ADD COLUMN IF NOT EXISTS "integration_webhook_enabled" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "integration_webhook_url" text,
  ADD COLUMN IF NOT EXISTS "integration_webhook_secret" text,
  ADD COLUMN IF NOT EXISTS "integration_webhook_events" text DEFAULT '[]';
