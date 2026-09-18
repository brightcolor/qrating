-- Besides the plain event news a guest can ask for the offers: presale starts,
-- prize draws and evenings that stay off the open programme.
ALTER TABLE newsletter_optins
  ADD COLUMN IF NOT EXISTS offers_optin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offers_consent_text TEXT;

ALTER TABLE newsletter_connections
  ADD COLUMN IF NOT EXISTS offers_field_tag TEXT NOT NULL DEFAULT 'ANGEBOTE';

-- The privacy page names who answers for the data of an organization.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS legal_address TEXT,
  ADD COLUMN IF NOT EXISTS legal_email TEXT;
