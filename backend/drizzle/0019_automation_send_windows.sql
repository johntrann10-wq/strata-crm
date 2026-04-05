ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS automation_send_window_start_hour integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS automation_send_window_end_hour integer DEFAULT 18;
