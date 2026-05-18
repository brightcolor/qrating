ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS two_factor_recovery_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS two_factor_challenge_hash TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_challenge_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_two_factor_challenge
  ON users(two_factor_challenge_hash)
  WHERE two_factor_challenge_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log(action);
