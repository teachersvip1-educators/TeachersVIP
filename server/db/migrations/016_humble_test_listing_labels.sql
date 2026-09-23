-- Keep the two explicitly configured geolocation test listings aligned with
-- their Humble location records, even when older seed commands were skipped.
UPDATE businesses
SET distance = 'Humble, TX'
WHERE id IN ('island-spice', 'cafe-101')
  AND distance IS DISTINCT FROM 'Humble, TX';
