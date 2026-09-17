-- Besides the event, a subscriber carries the way it came in, by default qrating itself.
ALTER TABLE newsletter_connections
  ADD COLUMN IF NOT EXISTS source_field_tag TEXT NOT NULL DEFAULT 'QUELLE',
  ADD COLUMN IF NOT EXISTS source_field_value TEXT NOT NULL DEFAULT 'qrating';
