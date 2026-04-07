ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS default_appointment_start_time text DEFAULT '09:00';
