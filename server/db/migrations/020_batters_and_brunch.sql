-- Add the supplied business for admin completion without duplicating an
-- existing manually-created listing or replacing its address/hours/details.
INSERT INTO businesses (id, name, category, description, image_url, published)
SELECT 'batters-and-brunch', 'Batters & Brunch', 'Dining',
       'Grand opening. Exclusive educator invite. New location — details coming soon.',
       '/BattersAndBrunch.jpeg', false
WHERE NOT EXISTS (
  SELECT 1 FROM businesses
  WHERE id = 'batters-and-brunch'
     OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') IN ('battersbrunch', 'battersandbrunch')
)
ON CONFLICT (id) DO NOTHING;

-- Apply the owner-supplied artwork to an existing matching listing as well.
UPDATE businesses
SET image_url = '/BattersAndBrunch.jpeg'
WHERE id = 'batters-and-brunch'
   OR regexp_replace(lower(name), '[^a-z0-9]', '', 'g') IN ('battersbrunch', 'battersandbrunch');
