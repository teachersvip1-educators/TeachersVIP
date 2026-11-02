-- Owner-requested approval of the KIPP Texas staff domain for K-12 educators.
-- Official school-leader and education-team contacts use @kipptexas.org:
-- https://kipptexas.org/school/kipp-sharp-prep/
-- https://kipptexas.org/multilingual/
-- These pages document staff use; the staff-only classification is the owner's
-- reviewed eligibility decision, not a claim that the pages publish an IT policy.
-- Email ownership and the selected educator role are still checked on confirmation.
-- Existing verification cases retain their recorded decision and audit history.

DO $$
DECLARE
  domain_record record;
  review_evidence constant text := 'Approved at the TeachersVIP owner''s request for K-12 educator verification. KIPP Texas Public Schools publishes school-leader and education-team contacts using @kipptexas.org at https://kipptexas.org/school/kipp-sharp-prep/ and https://kipptexas.org/multilingual/. Staff use is documented by these official sources; staff-only eligibility is the owner-approved classification. Email confirmation remains required.';
  review_url constant text := 'https://kipptexas.org/school/kipp-sharp-prep/';
BEGIN
  -- institution_id is nullable, so its composite unique constraint alone does
  -- not prevent duplicate standalone domain records. Reuse existing rows first.
  IF NOT EXISTS (SELECT 1 FROM educator_domains WHERE normalized_domain = 'kipptexas.org') THEN
    INSERT INTO educator_domains (
      id, normalized_domain, registrable_domain, classification, decision
    ) VALUES (
      gen_random_uuid(), 'kipptexas.org', 'kipptexas.org', 'unknown', 'manual_review'
    );
  END IF;

  FOR domain_record IN
    SELECT id, classification, decision
    FROM educator_domains
    WHERE normalized_domain = 'kipptexas.org'
      AND (classification IS DISTINCT FROM 'staff_only'
        OR decision IS DISTINCT FROM 'auto_eligible'
        OR eligible_role IS DISTINCT FROM 'K-12 educator'
        OR reviewed_at IS NULL
        OR NULLIF(trim(evidence), '') IS NULL)
    FOR UPDATE
  LOOP
    UPDATE educator_domains
    SET registrable_domain = 'kipptexas.org',
        classification = 'staff_only', decision = 'auto_eligible',
        eligible_role = 'K-12 educator', evidence = review_evidence,
        evidence_url = review_url, reviewed_at = now(), reviewed_by = NULL,
        updated_at = now()
    WHERE id = domain_record.id;

    INSERT INTO educator_domain_reviews (
      id, domain_id, previous_classification, previous_decision,
      classification, decision, eligible_role, evidence, evidence_url, action
    ) VALUES (
      gen_random_uuid(), domain_record.id, domain_record.classification,
      domain_record.decision, 'staff_only', 'auto_eligible', 'K-12 educator',
      review_evidence, review_url, 'reviewed'
    );
  END LOOP;
END $$;
