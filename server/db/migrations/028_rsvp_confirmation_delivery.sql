ALTER TABLE offer_interest_submissions
  ADD COLUMN IF NOT EXISTS rsvp_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_confirmation_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_confirmation_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_confirmation_attempt_key uuid;

-- Existing RSVP rows predate delivery tracking. Keep ordinary repeat submits
-- from sending duplicate messages; members can explicitly request a resend.
UPDATE offer_interest_submissions
SET rsvp_confirmation_sent_at = submitted_at
WHERE cta_type = 'rsvp'
  AND rsvp_confirmation_sent_at IS NULL;
