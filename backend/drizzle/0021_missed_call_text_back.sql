ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS missed_call_text_back_enabled boolean DEFAULT false;
