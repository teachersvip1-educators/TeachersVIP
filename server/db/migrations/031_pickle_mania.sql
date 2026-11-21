-- Add Pickle Mania (indoor pickleball, Lyric Market, downtown Houston) with the
-- owner-supplied artwork and its 15% educator offer. An existing listing an
-- administrator created by hand is reused, and its details are left untouched.
INSERT INTO businesses (
  id, name, category, description, image_url, website_url, distance, address,
  latitude, longitude, hours_timezone, published
)
SELECT 'pickle-mania', 'Pickle Mania', 'Sports & Events',
       'Houston''s premier indoor pickleball facility with high-quality courts, great vibes, and a community that feels like family.',
       '/PickleMania.webp', 'https://www.picklemanias.com', 'Downtown Houston',
       '411 Smith St, Unit 411B, Houston, TX 77002',
       29.7630899, -95.3645518, 'America/Chicago', false
WHERE NOT EXISTS (
  SELECT 1 FROM businesses
  WHERE id = 'pickle-mania'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'picklemania'
)
ON CONFLICT (id) DO NOTHING;

-- On-site Use Deal verification needs one location with a map position.
WITH partner AS (
  SELECT id FROM businesses
  WHERE id = 'pickle-mania'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'picklemania'
  ORDER BY (id = 'pickle-mania') DESC, id
  LIMIT 1
)
INSERT INTO business_locations (
  id, business_id, location_name, address, city, timezone, latitude, longitude,
  geofence_radius_m, active
)
SELECT partner.id || ':lyric-market', partner.id, 'Lyric Market',
       '411 Smith St, Unit 411B, Houston, TX 77002', 'Houston',
       'America/Chicago', 29.7630899, -95.3645518, 150, true
FROM partner
WHERE NOT EXISTS (
  SELECT 1 FROM business_locations location
  WHERE location.business_id = partner.id
    AND location.active
    AND location.latitude IS NOT NULL
    AND location.longitude IS NOT NULL
)
ON CONFLICT (id) DO NOTHING;

-- The offer as stated on the supplied artwork. No redemption text is stored, so
-- the standard cashier instruction is shown after a verified activation.
WITH partner AS (
  SELECT id FROM businesses
  WHERE id = 'pickle-mania'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = 'picklemania'
  ORDER BY (id = 'pickle-mania') DESC, id
  LIMIT 1
)
INSERT INTO deals (
  id, business_id, title, description, channel, category, restrictions,
  estimated_savings_cents, featured, image_url, published, cta_type,
  redemption_method, tracking_mode, usage_limit_count, usage_limit_period,
  usage_limit_scope, market_id
)
SELECT 'pickle-mania-15-off', partner.id,
       '15% Off for All Educators',
       'Save 15% at Pickle Mania, downtown Houston''s indoor pickleball facility. Just show your teacher ID.',
       'in_person', 'Sports & Events',
       'For verified educators. Show your teacher ID at check-in.',
       0, true, '/PickleMania.webp', true, 'use_deal',
       'cashier_instruction', 'standard_geolocation', NULL, 'none',
       'offer', 'houston'
FROM partner
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE deals.business_id = partner.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO deal_locations (deal_id, business_location_id)
SELECT deal.id, location.id
FROM deals deal
JOIN business_locations location ON location.business_id = deal.business_id
WHERE deal.id = 'pickle-mania-15-off'
  AND location.active
  AND location.latitude IS NOT NULL
  AND location.longitude IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE businesses SET published = true
WHERE id = (SELECT business_id FROM deals WHERE id = 'pickle-mania-15-off');
