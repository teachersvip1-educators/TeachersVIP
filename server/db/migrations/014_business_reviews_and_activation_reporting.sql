-- Reviews are educator feedback after a successful offer activation. They are
-- deliberately not evidence of a completed POS transaction or purchase.
CREATE TABLE IF NOT EXISTS business_reviews (
  id uuid PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activation_id uuid NOT NULL REFERENCES deal_activations(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text NOT NULL CHECK (length(trim(review_text)) BETWEEN 10 AND 1500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  moderation_notes text,
  moderated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);

CREATE INDEX IF NOT EXISTS business_reviews_public_idx
  ON business_reviews (created_at DESC)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS business_reviews_admin_idx
  ON business_reviews (status, created_at DESC);

CREATE INDEX IF NOT EXISTS deal_activations_reporting_idx
  ON deal_activations (business_id, business_location_id, user_id, created_at DESC)
  WHERE outcome = 'successful' AND activation_type = 'verified_on_site';
