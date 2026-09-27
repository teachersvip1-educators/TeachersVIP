ALTER TABLE deals ADD COLUMN IF NOT EXISTS cta_type text NOT NULL DEFAULT 'use_deal';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS event_name text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='deals_cta_type_check' AND conrelid='deals'::regclass) THEN
    ALTER TABLE deals ADD CONSTRAINT deals_cta_type_check CHECK (cta_type IN ('use_deal','join_waitlist','rsvp','get_launch_invite'));
  END IF;
END $$;

-- Interest records have their own lifecycle; they never create activation or usage rows.
CREATE TABLE IF NOT EXISTS offer_interest_submissions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cta_type text NOT NULL CHECK (cta_type IN ('join_waitlist','rsvp','get_launch_invite')),
  member_id text NOT NULL,
  full_name text NOT NULL,
  email citext NOT NULL,
  business_name text NOT NULL,
  event_name text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, deal_id)
);
CREATE INDEX IF NOT EXISTS offer_interest_offer_date_idx ON offer_interest_submissions(deal_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS offer_interest_business_idx ON offer_interest_submissions(business_id);
CREATE INDEX IF NOT EXISTS offer_interest_date_idx ON offer_interest_submissions(submitted_at DESC, id);
