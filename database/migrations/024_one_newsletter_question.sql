-- The opt-in asks once. What a guest says yes to stands in the consent text itself,
-- so the second flag and its own MailWizz field fall away again.
ALTER TABLE newsletter_optins
  DROP COLUMN IF EXISTS offers_optin,
  DROP COLUMN IF EXISTS offers_consent_text;

ALTER TABLE newsletter_connections
  DROP COLUMN IF EXISTS offers_field_tag;
