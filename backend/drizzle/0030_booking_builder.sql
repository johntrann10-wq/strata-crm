ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_default_flow text DEFAULT 'request';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_page_title text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_page_subtitle text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_confirmation_message text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_phone boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_require_vehicle boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_allow_customer_notes boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_show_prices boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_show_durations boolean DEFAULT true;

ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_enabled boolean DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_flow_type text DEFAULT 'inherit';
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_description text;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_deposit_amount decimal(12,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_lead_time_hours integer DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS booking_window_days integer DEFAULT 30;
