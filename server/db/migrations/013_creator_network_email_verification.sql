-- Public creator interest is accepted only after the supplied educator email
-- is confirmed. Existing verified members may submit with their verified email
-- without receiving another confirmation link.
ALTER TABLE creator_network_submissions
  ADD COLUMN IF NOT EXISTS submitted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS creator_network_email_verifications (
  id uuid PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES creator_network_submissions(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_network_email_verifications_active_idx
  ON creator_network_email_verifications (submission_id, expires_at DESC)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS creator_network_submissions_verified_created_idx
  ON creator_network_submissions (email_verified_at DESC, created_at DESC)
  WHERE email_verified_at IS NOT NULL;
