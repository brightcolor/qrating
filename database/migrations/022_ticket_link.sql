-- Per event: whether the guest page offers a ticket link while the sale runs.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ticket_link_enabled BOOLEAN NOT NULL DEFAULT true;
