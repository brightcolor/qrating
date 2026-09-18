-- Per event: whether the guest sees the events that are still to come, and which ones.
-- An empty list means the next ones by date.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS upcoming_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS upcoming_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
