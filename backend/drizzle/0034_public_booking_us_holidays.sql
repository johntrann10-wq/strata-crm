ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_closed_on_us_holidays boolean DEFAULT false;
