ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_service_mode text DEFAULT 'in_shop';
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_days text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_start_time text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_available_end_time text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer;
