-- Two switches per organization: the mark inside the QR code and the note on public pages.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS qr_mark_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_credit_enabled BOOLEAN NOT NULL DEFAULT true;
