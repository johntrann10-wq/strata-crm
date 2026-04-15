ALTER TABLE services
  ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer;
