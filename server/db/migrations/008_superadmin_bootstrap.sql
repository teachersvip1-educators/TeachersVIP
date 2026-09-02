ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS superadmin_bootstrap (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO superadmin_bootstrap(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS users_superadmin_idx ON users(is_superadmin) WHERE is_superadmin;
