-- Each person picks the look of the admin area for themselves. Empty means the default look.
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_theme TEXT;
