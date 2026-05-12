CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE event_source AS ENUM ('manual', 'pretix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft', 'active', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE feedback_start_mode AS ENUM ('event_start', 'event_end', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE image_source AS ENUM ('manual', 'pretix_settings', 'pretix_subevent', 'organization', 'fallback');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE qr_source_type AS ENUM ('dynamic_organization', 'event_specific');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  default_language TEXT NOT NULL DEFAULT 'de',
  default_feedback_window_days INTEGER NOT NULL DEFAULT 3,
  default_feedback_window_hours INTEGER,
  default_feedback_start_mode feedback_start_mode NOT NULL DEFAULT 'event_start',
  ticketshop_url TEXT,
  website_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  privacy_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pretix_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  pretix_organizer_slug TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  sync_enabled BOOLEAN NOT NULL DEFAULT true,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
  import_live_only BOOLEAN NOT NULL DEFAULT false,
  ignore_testmode BOOLEAN NOT NULL DEFAULT true,
  import_public_only BOOLEAN NOT NULL DEFAULT false,
  import_subevents BOOLEAN NOT NULL DEFAULT true,
  import_event_images BOOLEAN NOT NULL DEFAULT true,
  cache_event_images BOOLEAN NOT NULL DEFAULT false,
  allowed_image_hosts JSONB,
  preferred_image_settings_key TEXT,
  image_key_candidates JSONB,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source event_source NOT NULL DEFAULT 'manual',
  pretix_connection_id UUID REFERENCES pretix_connections(id) ON DELETE SET NULL,
  pretix_organizer_slug TEXT,
  pretix_event_slug TEXT,
  pretix_subevent_id INTEGER,
  pretix_public_url TEXT,
  pretix_has_subevents BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  event_feedback_token TEXT NOT NULL UNIQUE,
  date_from TIMESTAMPTZ NOT NULL,
  date_to TIMESTAMPTZ,
  date_admission TIMESTAMPTZ,
  event_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  location TEXT,
  image_url TEXT,
  image_alt TEXT,
  image_source image_source,
  pretix_event_image_url TEXT,
  cached_image_url TEXT,
  detected_image_settings_key TEXT,
  image_last_synced_at TIMESTAMPTZ,
  image_sync_error TEXT,
  status event_status NOT NULL DEFAULT 'active',
  feedback_enabled BOOLEAN NOT NULL DEFAULT true,
  feedback_starts_mode feedback_start_mode NOT NULL DEFAULT 'event_start',
  feedback_starts_at TIMESTAMPTZ,
  feedback_window_days INTEGER NOT NULL DEFAULT 3,
  feedback_window_hours INTEGER,
  feedback_ends_at TIMESTAMPTZ,
  resolver_priority INTEGER NOT NULL DEFAULT 0,
  not_found_in_source BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  raw_source_payload JSONB,
  raw_settings_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  UNIQUE NULLS NOT DISTINCT (pretix_connection_id, pretix_event_slug, pretix_subevent_id)
);

CREATE TABLE IF NOT EXISTS feedback_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_template BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_form_id UUID NOT NULL REFERENCES feedback_forms(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL,
  internal_name TEXT NOT NULL,
  label TEXT NOT NULL,
  help_text TEXT,
  placeholder TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  category TEXT,
  privacy_relevant BOOLEAN NOT NULL DEFAULT false,
  show_in_export BOOLEAN NOT NULL DEFAULT true,
  show_in_dashboard BOOLEAN NOT NULL DEFAULT true,
  anonymous_answer BOOLEAN NOT NULL DEFAULT true,
  visibility_rules JSONB,
  options JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qr_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  label TEXT NOT NULL,
  type qr_source_type NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  scans_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, event_id, source_slug, type)
);

CREATE TABLE IF NOT EXISTS feedback_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  qr_source_id UUID REFERENCES qr_sources(id) ON DELETE SET NULL,
  resolved_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  nps_score INTEGER CHECK (nps_score BETWEEN 0 AND 10),
  comment_positive TEXT,
  comment_improvement TEXT,
  general_comment TEXT,
  newsletter_optin BOOLEAN NOT NULL DEFAULT false,
  contact_requested BOOLEAN NOT NULL DEFAULT false,
  contact_phone TEXT,
  contact_note TEXT,
  testimonial_allowed BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent_hash TEXT,
  ip_hash TEXT,
  spam_score NUMERIC,
  is_suspicious BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS feedback_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_response_id UUID NOT NULL REFERENCES feedback_responses(id) ON DELETE CASCADE,
  feedback_question_id UUID NOT NULL REFERENCES feedback_questions(id) ON DELETE CASCADE,
  answer_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS newsletter_optins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  feedback_response_id UUID REFERENCES feedback_responses(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  consent_text TEXT NOT NULL,
  consent_given_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  double_optin_status TEXT,
  double_optin_confirmed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'feedback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'de',
  style TEXT NOT NULL DEFAULT 'herzlich',
  scope TEXT NOT NULL DEFAULT 'public',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, event_id, language, scope, key)
);

CREATE TABLE IF NOT EXISTS event_image_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  cached_url TEXT,
  mime_type TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  source TEXT,
  settings_key TEXT,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  events JSONB NOT NULL DEFAULT '["feedback.created"]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  last_status TEXT,
  last_error TEXT,
  last_called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT false,
  username TEXT,
  password_encrypted TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  reply_to TEXT,
  notification_email TEXT,
  low_rating_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT false,
  last_test_status TEXT,
  last_test_error TEXT,
  last_test_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_org ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_token ON events(event_feedback_token);
CREATE INDEX IF NOT EXISTS idx_feedback_event ON feedback_responses(event_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submitted ON feedback_responses(submitted_at);
CREATE INDEX IF NOT EXISTS idx_user_event_assignments_event ON user_event_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON notification_channels(user_id);
