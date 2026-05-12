ALTER TABLE feedback_responses
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_note TEXT;

CREATE TABLE IF NOT EXISTS user_event_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  notify_low_rating BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN (
    'email',
    'discord',
    'slack',
    'mattermost',
    'teams',
    'telegram',
    'pushover',
    'ntfy',
    'gotify',
    'webhook'
  )),
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_rating INTEGER NOT NULL DEFAULT 2 CHECK (min_rating BETWEEN 1 AND 5),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_encrypted TEXT,
  last_status TEXT,
  last_error TEXT,
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_event_assignments_event ON user_event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id);
