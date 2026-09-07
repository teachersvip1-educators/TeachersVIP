-- Educator verification registry and review history.
-- This migration stores normalized source records only. Raw federal CSV files must
-- remain outside the repository and are identified by their import checksum.

CREATE TABLE IF NOT EXISTS education_data_imports (
  id uuid PRIMARY KEY,
  source_code text NOT NULL CHECK (source_code IN ('CCD', 'PSS', 'IPEDS', 'DAPIP')),
  release_version text NOT NULL,
  official_url text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'dry_run')),
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, release_version, checksum_sha256)
);

CREATE TABLE IF NOT EXISTS education_institutions (
  id uuid PRIMARY KEY,
  source_code text NOT NULL CHECK (source_code IN ('CCD', 'PSS', 'IPEDS', 'DAPIP')),
  source_institution_id text NOT NULL,
  institution_type text NOT NULL CHECK (institution_type IN ('district', 'public_school', 'charter_school', 'private_school', 'college', 'university', 'accreditor', 'other')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'US',
  website_url text,
  source_release text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_import_id uuid REFERENCES education_data_imports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_code, source_institution_id)
);

CREATE TABLE IF NOT EXISTS education_institution_snapshots (
  id uuid PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES education_data_imports(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES education_institutions(id) ON DELETE RESTRICT,
  record_hash_sha256 text NOT NULL CHECK (record_hash_sha256 ~ '^[0-9a-fA-F]{64}$'),
  normalized_record jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, institution_id)
);

CREATE TABLE IF NOT EXISTS educator_domains (
  id uuid PRIMARY KEY,
  normalized_domain text NOT NULL,
  registrable_domain text NOT NULL,
  institution_id uuid REFERENCES education_institutions(id) ON DELETE SET NULL,
  classification text NOT NULL CHECK (classification IN ('staff_only', 'shared_staff_student', 'personal_provider', 'unknown')),
  eligible_role text CHECK (eligible_role IN ('K-12 educator', 'College professor', 'both')),
  decision text NOT NULL DEFAULT 'manual_review' CHECK (decision IN ('auto_eligible', 'manual_review', 'blocked')),
  evidence text,
  evidence_url text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  source_import_id uuid REFERENCES education_data_imports(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT educator_domain_auto_eligibility_requires_review CHECK (
    decision <> 'auto_eligible'
    OR (classification = 'staff_only' AND eligible_role IS NOT NULL AND evidence IS NOT NULL AND length(trim(evidence)) > 0 AND reviewed_at IS NOT NULL)
  ),
  UNIQUE (institution_id, normalized_domain)
);

CREATE TABLE IF NOT EXISTS educator_domain_reviews (
  id uuid PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES educator_domains(id) ON DELETE CASCADE,
  previous_classification text,
  previous_decision text,
  classification text NOT NULL CHECK (classification IN ('staff_only', 'shared_staff_student', 'personal_provider', 'unknown')),
  decision text NOT NULL CHECK (decision IN ('auto_eligible', 'manual_review', 'blocked')),
  eligible_role text CHECK (eligible_role IN ('K-12 educator', 'College professor', 'both')),
  evidence text,
  evidence_url text,
  action text NOT NULL CHECK (action IN ('created', 'reviewed', 'import_refreshed', 'suspended')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS educator_verification_cases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_email citext NOT NULL,
  selected_role text NOT NULL CHECK (selected_role IN ('K-12 educator', 'College professor')),
  normalized_domain text NOT NULL,
  institution_id uuid REFERENCES education_institutions(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES educator_domains(id) ON DELETE SET NULL,
  email_link_token_hash text UNIQUE,
  email_link_expires_at timestamptz,
  email_verified_at timestamptz,
  email_link_consumed_at timestamptz,
  status text NOT NULL DEFAULT 'email_pending' CHECK (status IN ('email_pending', 'manual_review', 'verified', 'rejected', 'suspended')),
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reverify_required_at timestamptz,
  reverify_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS educator_verification_case_user_idx ON educator_verification_cases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS educator_verification_case_queue_idx ON educator_verification_cases(status, created_at ASC);
CREATE INDEX IF NOT EXISTS educator_domain_lookup_idx ON educator_domains(normalized_domain, decision);
CREATE INDEX IF NOT EXISTS education_institution_name_idx ON education_institutions(lower(name));

CREATE TABLE IF NOT EXISTS educator_verification_audits (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES educator_verification_cases(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'email_sent', 'email_verified', 'auto_eligible', 'manual_review', 'approved', 'rejected', 'request_information', 'suspended', 'reverification_required', 'pass2u_pending', 'pass2u_active', 'pass2u_failed')),
  previous_status text,
  next_status text,
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS educator_verification_audit_case_idx ON educator_verification_audits(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS educator_reverification_campaigns (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS educator_reverification_records (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES educator_reverification_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prior_verified_at timestamptz,
  case_id uuid REFERENCES educator_verification_cases(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'exception')),
  resolution_note text,
  resolved_at timestamptz,
  UNIQUE (campaign_id, user_id)
);
