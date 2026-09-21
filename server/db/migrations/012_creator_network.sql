-- Interested educator creators are kept separate from business partnership
-- applications. This is an intake register only; it does not create or imply
-- an influencer campaign, business service, or public directory.
CREATE TABLE IF NOT EXISTS creator_network_submissions (
  id uuid PRIMARY KEY,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 140),
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 120),
  educator_email citext NOT NULL,
  contact_information text NOT NULL CHECK (length(trim(contact_information)) BETWEEN 5 AND 500),
  social_handles text NOT NULL CHECK (length(trim(social_handles)) BETWEEN 2 AND 1000),
  platforms text[] NOT NULL CHECK (cardinality(platforms) BETWEEN 1 AND 8),
  follower_range text NOT NULL CHECK (length(trim(follower_range)) BETWEEN 2 AND 80),
  content_niches text[] NOT NULL CHECK (cardinality(content_niches) BETWEEN 1 AND 8),
  sample_content text NOT NULL CHECK (length(trim(sample_content)) BETWEEN 5 AND 1500),
  opportunity_interests text[] NOT NULL CHECK (cardinality(opportunity_interests) BETWEEN 1 AND 8),
  contact_consent boolean NOT NULL DEFAULT false CHECK (contact_consent),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_network_city_idx
  ON creator_network_submissions (lower(city));
CREATE INDEX IF NOT EXISTS creator_network_status_created_idx
  ON creator_network_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_network_follower_range_idx
  ON creator_network_submissions (follower_range);
CREATE INDEX IF NOT EXISTS creator_network_platforms_idx
  ON creator_network_submissions USING gin (platforms);
CREATE INDEX IF NOT EXISTS creator_network_niches_idx
  ON creator_network_submissions USING gin (content_niches);
