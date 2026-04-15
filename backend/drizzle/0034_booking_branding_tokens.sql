ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "booking_brand_logo_url" text,
  ADD COLUMN IF NOT EXISTS "booking_brand_primary_color_token" text DEFAULT 'orange',
  ADD COLUMN IF NOT EXISTS "booking_brand_accent_color_token" text DEFAULT 'amber',
  ADD COLUMN IF NOT EXISTS "booking_brand_background_tone_token" text DEFAULT 'ivory',
  ADD COLUMN IF NOT EXISTS "booking_brand_button_style_token" text DEFAULT 'solid';
