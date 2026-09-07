-- Business onboarding, operational locations, and server-validated deal activations.
-- This migration intentionally leaves deal_use_reports untouched: those rows are
-- historical self-reports and are not converted into verified activations.

CREATE TABLE IF NOT EXISTS business_applications (
  id text PRIMARY KEY,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  business_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email citext NOT NULL,
  contact_phone text,
  category text,
  proposed_offer text NOT NULL,
  pos_system text NOT NULL,
  pos_version text,
  redemption_method text NOT NULL CHECK (redemption_method IN ('pos_button','coupon_code','barcode','cashier_instruction')),
  redemption_payload_encrypted text,
  display_ttl_seconds integer NOT NULL DEFAULT 300 CHECK (display_ttl_seconds BETWEEN 30 AND 3600),
  usage_limit_count integer CHECK (usage_limit_count IS NULL OR usage_limit_count > 0),
  usage_limit_period text NOT NULL DEFAULT 'none' CHECK (usage_limit_period IN ('none','day','month','promo')),
  usage_limit_scope text NOT NULL DEFAULT 'offer' CHECK (usage_limit_scope IN ('offer','location')),
  tracking_mode text NOT NULL DEFAULT 'standard_geolocation' CHECK (tracking_mode IN ('standard_geolocation','enhanced_pos')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','under_review','approved','rejected')),
  proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,
  review_notes text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (proposed_ends_at IS NULL OR proposed_starts_at IS NULL OR proposed_ends_at > proposed_starts_at),
  CHECK ((usage_limit_period = 'none' AND usage_limit_count IS NULL) OR usage_limit_period <> 'none')
);

CREATE INDEX IF NOT EXISTS business_applications_status_idx ON business_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS business_application_locations (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES business_applications(id) ON DELETE CASCADE,
  location_name text,
  address text NOT NULL,
  city text,
  region text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'US',
  timezone text NOT NULL DEFAULT 'UTC',
  latitude double precision,
  longitude double precision,
  geofence_radius_m integer NOT NULL DEFAULT 150 CHECK (geofence_radius_m BETWEEN 25 AND 5000),
  geocoded_at timestamptz,
  geocode_provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS business_application_locations_application_idx
  ON business_application_locations(application_id);

CREATE TABLE IF NOT EXISTS business_locations (
  id text PRIMARY KEY,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  location_name text,
  address text,
  city text,
  region text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'US',
  timezone text NOT NULL DEFAULT 'UTC',
  latitude double precision,
  longitude double precision,
  geofence_radius_m integer NOT NULL DEFAULT 150 CHECK (geofence_radius_m BETWEEN 25 AND 5000),
  source_application_location_id text REFERENCES business_application_locations(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX IF NOT EXISTS business_locations_business_idx ON business_locations(business_id, active);
CREATE INDEX IF NOT EXISTS business_locations_coordinates_idx ON business_locations(latitude, longitude)
  WHERE active AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Preserve every existing business record, including null coordinates. Existing
-- operational location rows are never overwritten; only missing legacy values
-- are filled from businesses.
INSERT INTO business_locations (
  id, business_id, location_name, address, timezone, latitude, longitude, active
)
SELECT b.id || ':primary', b.id, 'Primary location', b.address, 'UTC', b.latitude, b.longitude, b.published
FROM businesses b
ON CONFLICT (id) DO UPDATE SET
  address = COALESCE(business_locations.address, EXCLUDED.address),
  latitude = COALESCE(business_locations.latitude, EXCLUDED.latitude),
  longitude = COALESCE(business_locations.longitude, EXCLUDED.longitude);

CREATE TABLE IF NOT EXISTS deal_locations (
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  business_location_id text NOT NULL REFERENCES business_locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, business_location_id)
);

CREATE INDEX IF NOT EXISTS deal_locations_location_idx ON deal_locations(business_location_id, deal_id);

INSERT INTO deal_locations(deal_id, business_location_id)
SELECT d.id, d.business_id || ':primary'
FROM deals d
JOIN business_locations bl ON bl.id = d.business_id || ':primary'
WHERE d.channel = 'in_person'
ON CONFLICT DO NOTHING;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS redemption_method text,
  ADD COLUMN IF NOT EXISTS redemption_payload_encrypted text,
  ADD COLUMN IF NOT EXISTS display_ttl_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS usage_limit_count integer,
  ADD COLUMN IF NOT EXISTS usage_limit_period text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS usage_limit_scope text NOT NULL DEFAULT 'offer',
  ADD COLUMN IF NOT EXISTS tracking_mode text;

UPDATE deals
SET redemption_method = COALESCE(redemption_method, CASE WHEN promo_code_encrypted IS NOT NULL THEN 'coupon_code' ELSE 'cashier_instruction' END),
    redemption_payload_encrypted = COALESCE(redemption_payload_encrypted, promo_code_encrypted),
    tracking_mode = COALESCE(tracking_mode, CASE WHEN channel = 'online' THEN 'online' ELSE 'standard_geolocation' END)
WHERE redemption_method IS NULL OR tracking_mode IS NULL OR redemption_payload_encrypted IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_redemption_method_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_redemption_method_check
      CHECK (redemption_method IN ('pos_button','coupon_code','barcode','cashier_instruction'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_display_ttl_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_display_ttl_check CHECK (display_ttl_seconds BETWEEN 30 AND 3600);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_usage_limit_count_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_usage_limit_count_check CHECK (usage_limit_count IS NULL OR usage_limit_count > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_usage_limit_period_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_usage_limit_period_check CHECK (usage_limit_period IN ('none','day','month','promo'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_usage_limit_scope_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_usage_limit_scope_check CHECK (usage_limit_scope IN ('offer','location'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_tracking_mode_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_tracking_mode_check CHECK (tracking_mode IN ('standard_geolocation','enhanced_pos','online'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deal_activations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE RESTRICT,
  business_id text NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  business_location_id text REFERENCES business_locations(id) ON DELETE RESTRICT,
  activation_type text NOT NULL CHECK (activation_type IN ('verified_on_site','online_offer_access')),
  idempotency_key text NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','successful','denied')),
  location_decision text NOT NULL CHECK (location_decision IN ('not_requested','inside','outside','stale','low_accuracy','unavailable','invalid','limit_reached')),
  submitted_latitude_encrypted text,
  submitted_longitude_encrypted text,
  exact_location_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  location_observed_at timestamptz,
  reported_accuracy_m double precision CHECK (reported_accuracy_m IS NULL OR reported_accuracy_m >= 0),
  distance_m double precision CHECK (distance_m IS NULL OR distance_m >= 0),
  usage_bucket text,
  usage_counted boolean NOT NULL DEFAULT false,
  redemption_payload_encrypted text,
  payload_expires_at timestamptz,
  risk_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, deal_id, idempotency_key),
  CHECK ((activation_type = 'online_offer_access' AND business_location_id IS NULL AND location_decision = 'not_requested')
      OR (activation_type = 'verified_on_site' AND business_location_id IS NOT NULL)),
  CHECK ((outcome = 'successful' AND payload_expires_at IS NOT NULL) OR outcome <> 'successful')
);

CREATE INDEX IF NOT EXISTS deal_activations_deal_time_idx ON deal_activations(deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_activations_business_location_idx ON deal_activations(business_id, business_location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_activations_successful_idx ON deal_activations(created_at DESC)
  WHERE outcome = 'successful' AND activation_type = 'verified_on_site';
CREATE INDEX IF NOT EXISTS deal_activations_exact_location_retention_idx
  ON deal_activations(exact_location_expires_at)
  WHERE submitted_latitude_encrypted IS NOT NULL OR submitted_longitude_encrypted IS NOT NULL;

CREATE TABLE IF NOT EXISTS deal_usage_counters (
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  bucket_key text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, user_id, scope_key, bucket_key)
);

-- A single row-level upsert is the limit gate. Concurrent activation requests
-- for one educator/deal/scope/bucket serialize on this primary key.
CREATE OR REPLACE FUNCTION consume_deal_usage_limit(
  p_deal_id text,
  p_user_id uuid,
  p_scope_key text,
  p_bucket_key text,
  p_limit_count integer
)
RETURNS TABLE (allowed boolean, usage_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
  next_count integer;
BEGIN
  INSERT INTO deal_usage_counters (deal_id, user_id, scope_key, bucket_key, usage_count)
  VALUES (p_deal_id, p_user_id, p_scope_key, p_bucket_key, 1)
  ON CONFLICT (deal_id, user_id, scope_key, bucket_key) DO UPDATE
    SET usage_count = deal_usage_counters.usage_count + 1,
        updated_at = now()
    WHERE p_limit_count IS NULL OR deal_usage_counters.usage_count < p_limit_count
  RETURNING usage_count INTO next_count;

  IF FOUND THEN
    RETURN QUERY SELECT true, next_count;
  ELSE
    SELECT usage_count INTO next_count
    FROM deal_usage_counters
    WHERE deal_id = p_deal_id AND user_id = p_user_id
      AND scope_key = p_scope_key AND bucket_key = p_bucket_key;
    RETURN QUERY SELECT false, COALESCE(next_count, 0);
  END IF;
END;
$$;
