ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS automation_abandoned_quotes_enabled boolean DEFAULT false;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS automation_abandoned_quote_hours integer DEFAULT 48;
