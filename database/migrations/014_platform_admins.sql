-- Accounts that run the installation itself, above the organizations.
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin BOOLEAN NOT NULL DEFAULT false;

-- The first account of an installation set it up, so it keeps the platform until it hands the role on.
UPDATE users
SET platform_admin = true, updated_at = now()
WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE platform_admin = true);
