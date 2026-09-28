-- A new password ends the sessions signed before it. Every session carries the version of its
-- account; setting a password raises the version, and older sessions no longer match.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
