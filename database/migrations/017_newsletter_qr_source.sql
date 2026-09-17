-- The way an entry came in can name the QR source it was scanned from.
ALTER TABLE newsletter_connections
  ADD COLUMN IF NOT EXISTS source_field_use_qr BOOLEAN NOT NULL DEFAULT true;
