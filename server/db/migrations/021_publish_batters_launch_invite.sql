-- Publish the supplied grand-opening announcement on Discover. This collects
-- verified educator interest; it is not a redeemable discount or an activation.
WITH partner AS (
  SELECT id FROM businesses
  WHERE id = 'batters-and-brunch'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') IN ('battersbrunch', 'battersandbrunch')
  ORDER BY (id = 'batters-and-brunch') DESC, id
  LIMIT 1
)
INSERT INTO deals (
  id, business_id, title, description, channel, category, restrictions,
  estimated_savings_cents, image_url, published, cta_type, event_name,
  usage_limit_count, usage_limit_period
)
SELECT 'batters-brunch-grand-opening', id,
       'Grand Opening — Exclusive Educator Invite',
       'Batters & Brunch is opening a new location. Register your interest in the exclusive educator invite. Location and opening details are coming soon.',
       'in_person', 'Dining',
       'For verified educators. Date and location details coming soon. Registering interest does not confirm admission or reserve a place.',
       0, '/BattersAndBrunch.jpeg', true, 'get_launch_invite',
       'Batters & Brunch Grand Opening', NULL, 'none'
FROM partner
ON CONFLICT (id) DO NOTHING;

UPDATE businesses SET published = true
WHERE id = (SELECT business_id FROM deals WHERE id = 'batters-brunch-grand-opening');
