ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS integration_job_id uuid,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status text,
  ADD COLUMN IF NOT EXISTS provider_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_error_code text;

CREATE UNIQUE INDEX IF NOT EXISTS notification_logs_provider_message_unique
  ON notification_logs (channel, provider_message_id);
