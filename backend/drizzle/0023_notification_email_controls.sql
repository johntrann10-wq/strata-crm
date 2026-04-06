ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "notification_appointment_confirmation_email_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notification_appointment_reminder_email_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notification_abandoned_quote_email_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notification_review_request_email_enabled" boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "notification_lapsed_client_email_enabled" boolean DEFAULT true;
