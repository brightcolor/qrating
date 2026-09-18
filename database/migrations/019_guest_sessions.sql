-- Every visit of a guest page, with the step the guest got to.
-- It answers two questions: how often was the page opened, and where do people stop.
CREATE TABLE IF NOT EXISTS guest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- The browser keeps this key for the visit; it says nothing about the person.
  session_key TEXT NOT NULL,
  source_type TEXT,
  qr_source_id UUID REFERENCES qr_sources(id) ON DELETE SET NULL,
  steps_total INTEGER NOT NULL DEFAULT 0,
  last_step TEXT,
  last_step_kind TEXT,
  last_step_label TEXT,
  last_step_index INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  feedback_response_id UUID REFERENCES feedback_responses(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent_hash TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, session_key)
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_event ON guest_sessions (event_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_organization ON guest_sessions (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_sessions_open ON guest_sessions (event_id, last_step_index) WHERE completed_at IS NULL;
