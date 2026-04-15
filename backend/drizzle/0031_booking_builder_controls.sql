ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_primary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_secondary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_trust_bullet_tertiary text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_notes_prompt text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_email boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_days text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_start_time text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_available_end_time text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_blackout_dates text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_slot_interval_minutes integer DEFAULT 15;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_capacity_per_slot integer;

ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_featured boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_hide_price boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_hide_duration boolean DEFAULT false;
