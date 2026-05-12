ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS retention_low_rating_phone_days INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS retention_feedback_days INTEGER,
  ADD COLUMN IF NOT EXISTS retention_newsletter_days INTEGER,
  ADD COLUMN IF NOT EXISTS wallboard_settings JSONB NOT NULL DEFAULT '{"dark_mode":true,"refresh_seconds":15}'::jsonb;

ALTER TABLE pretix_connections
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at TIMESTAMPTZ;

ALTER TABLE event_image_cache
  ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS cache_status TEXT NOT NULL DEFAULT 'cached' CHECK (cache_status IN ('cached','failed','skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_image_cache_variant
  ON event_image_cache(event_id, original_url, variant);

CREATE TABLE IF NOT EXISTS qr_source_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  qr_source_id UUID REFERENCES qr_sources(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  day DATE NOT NULL,
  scans_count INTEGER NOT NULL DEFAULT 0,
  feedback_count INTEGER NOT NULL DEFAULT 0,
  average_rating NUMERIC,
  newsletter_optins INTEGER NOT NULL DEFAULT 0,
  low_ratings INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, event_id, qr_source_id, source_type, day)
);

CREATE INDEX IF NOT EXISTS idx_qr_source_daily_stats_event_day
  ON qr_source_daily_stats(event_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_users_invite_token
  ON users(invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON users(password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
