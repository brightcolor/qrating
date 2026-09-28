-- The first setup asks for a code only the operator can read: in the log of the backend or
-- through a command in the container. One code at a time, kept as a hash; a new one replaces it,
-- and the finished setup removes it.
CREATE TABLE IF NOT EXISTS setup_codes (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
