ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS booking_request_require_exact_time boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_request_allow_time_windows boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_request_allow_flexibility boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_request_allow_alternate_slots boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_request_alternate_slot_limit integer DEFAULT 3,
  ADD COLUMN IF NOT EXISTS booking_request_alternate_offer_expiry_hours integer,
  ADD COLUMN IF NOT EXISTS booking_request_confirmation_copy text,
  ADD COLUMN IF NOT EXISTS booking_request_owner_response_page_copy text,
  ADD COLUMN IF NOT EXISTS booking_request_alternate_acceptance_copy text,
  ADD COLUMN IF NOT EXISTS booking_request_choose_another_day_copy text;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS booking_request_require_exact_time boolean,
  ADD COLUMN IF NOT EXISTS booking_request_allow_time_windows boolean,
  ADD COLUMN IF NOT EXISTS booking_request_allow_flexibility boolean,
  ADD COLUMN IF NOT EXISTS booking_request_review_message text,
  ADD COLUMN IF NOT EXISTS booking_request_allow_alternate_slots boolean,
  ADD COLUMN IF NOT EXISTS booking_request_alternate_slot_limit integer,
  ADD COLUMN IF NOT EXISTS booking_request_alternate_offer_expiry_hours integer;

UPDATE businesses
SET booking_request_alternate_slot_limit = 3
WHERE booking_request_alternate_slot_limit IS NULL;
