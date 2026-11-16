-- Catering is an optional service profile: a restaurant can remain in Dining.
-- No partners are invented or enabled without reviewed details and a recipient.
CREATE TABLE IF NOT EXISTS catering_profiles (
  business_id text PRIMARY KEY REFERENCES businesses(id),
  market_id text NOT NULL,
  service_area text NOT NULL,
  perk text NOT NULL,
  minimum_guests integer CHECK (minimum_guests > 0),
  lead_time text NOT NULL DEFAULT '',
  delivery_options text NOT NULL DEFAULT '',
  quote_email text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT published OR length(quote_email) > 3)
);
CREATE INDEX IF NOT EXISTS catering_profiles_market_idx ON catering_profiles(market_id) WHERE published;

CREATE TABLE IF NOT EXISTS catering_requests (
  id uuid PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_key uuid NOT NULL,
  request_fingerprint text NOT NULL,
  business_name text NOT NULL,
  market_id text NOT NULL,
  quote_email text NOT NULL,
  school_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  event_date date NOT NULL,
  event_time text NOT NULL DEFAULT '',
  guest_count integer NOT NULL CHECK (guest_count BETWEEN 1 AND 100000),
  budget text NOT NULL DEFAULT '',
  delivery_address text NOT NULL,
  dietary_requirements text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  consented_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  notification_sent_at timestamptz,
  notification_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS catering_requests_created_idx ON catering_requests(created_at DESC, id);
CREATE INDEX IF NOT EXISTS catering_requests_business_idx ON catering_requests(business_id, created_at DESC);
