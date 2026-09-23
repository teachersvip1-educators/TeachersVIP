CREATE TABLE city_deal_alerts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  city text NOT NULL,
  email citext NOT NULL,
  unsubscribe_token uuid NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX city_deal_alerts_city_idx ON city_deal_alerts(lower(city)) WHERE active;

CREATE TABLE city_deal_alert_deliveries (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE business_suggestions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  city text NOT NULL,
  location_hint text,
  reason text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_suggestions_status_idx ON business_suggestions(status,created_at DESC);

CREATE TABLE offer_reports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('expired','not_honored','incorrect_information')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_reports_status_idx ON offer_reports(status,created_at DESC);

CREATE TABLE business_review_reports (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES business_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('spam','abusive','inaccurate','other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id,user_id)
);
CREATE INDEX business_review_reports_status_idx ON business_review_reports(status,created_at DESC);

CREATE TABLE business_review_comments (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES business_reviews(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK(length(trim(body)) BETWEEN 2 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_review_comments_public_idx ON business_review_comments(review_id,created_at) WHERE status='approved';

CREATE TABLE contact_messages (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email citext NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
