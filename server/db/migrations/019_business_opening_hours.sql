ALTER TABLE businesses ADD COLUMN IF NOT EXISTS opening_hours jsonb;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hours_timezone text NOT NULL DEFAULT 'UTC';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='businesses_opening_hours_object' AND conrelid='businesses'::regclass) THEN
    ALTER TABLE businesses ADD CONSTRAINT businesses_opening_hours_object
      CHECK (opening_hours IS NULL OR jsonb_typeof(opening_hours)='object');
  END IF;
END $$;

-- Preserve legacy manual status until an admin supplies a weekly schedule.
UPDATE businesses b SET hours_timezone=l.timezone
FROM (SELECT DISTINCT ON (business_id) business_id,timezone FROM business_locations
      WHERE active ORDER BY business_id,created_at,id) l
WHERE b.id=l.business_id AND b.hours_timezone='UTC' AND b.opening_hours IS NULL;
