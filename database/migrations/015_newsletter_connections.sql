-- The newsletter system of an organization (MailWizz) that receives the opt-ins.
CREATE TABLE IF NOT EXISTS newsletter_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mailwizz' CHECK (provider IN ('mailwizz')),
  api_url TEXT NOT NULL,
  api_key_encrypted TEXT,
  list_uid TEXT NOT NULL,
  -- Tag of the custom field in MailWizz that carries the event of the entry.
  event_field_tag TEXT NOT NULL DEFAULT 'VERANSTALTUNG',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

-- Every opt-in keeps the state of its handover, so a later run knows what is left.
ALTER TABLE newsletter_optins
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_optins_pending
  ON newsletter_optins (organization_id, consent_given_at)
  WHERE synced_at IS NULL;
