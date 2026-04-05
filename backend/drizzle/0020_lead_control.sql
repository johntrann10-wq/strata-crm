ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_capture_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_email_enabled boolean DEFAULT true;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS lead_auto_response_sms_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_uncontacted_leads_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS automation_uncontacted_lead_hours integer DEFAULT 2;
