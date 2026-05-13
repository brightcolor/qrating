ALTER TABLE newsletter_optins
  ADD COLUMN IF NOT EXISTS email_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS email_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_domain TEXT;

ALTER TABLE newsletter_optins
  ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_optins_email_hash
  ON newsletter_optins(organization_id, email_hash)
  WHERE email_hash IS NOT NULL;

ALTER TABLE webhook_endpoints
  ADD COLUMN IF NOT EXISTS secret_encrypted TEXT;

ALTER TABLE low_rating_cases
  ADD COLUMN IF NOT EXISTS contact_note_encrypted TEXT;

UPDATE feedback_responses
SET contact_phone = NULL,
    contact_note = NULL
WHERE contact_phone IS NOT NULL
   OR contact_note IS NOT NULL;

UPDATE low_rating_cases
SET contact_note = NULL
WHERE contact_note IS NOT NULL;
