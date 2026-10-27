ALTER TABLE users ADD COLUMN IF NOT EXISTS offers_email citext;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Older autocomplete labels included the country; retain city and state only.
UPDATE users SET city=regexp_replace(city, ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$', '', 'i')
WHERE city ~* ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$';
UPDATE city_deal_alerts SET city=regexp_replace(city, ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$', '', 'i')
WHERE city ~* ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$';
UPDATE creator_network_submissions SET city=regexp_replace(city, ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$', '', 'i')
WHERE city ~* ',[[:space:]]*(United States( of America)?|USA|US)[[:space:]]*$';

-- Keep sample records for admin reference and existing history, but remove them
-- and their offers from public discovery and direct offer access.
UPDATE businesses SET published=false WHERE id IN (
  'island-spice','glow-beauty','cafe-101','booknook','teacher-tech',
  'district-social','lounge-social','skyline-auto-spa','vibes-juice-co'
);
UPDATE deals SET published=false WHERE business_id IN (
  'island-spice','glow-beauty','cafe-101','booknook','teacher-tech',
  'district-social','lounge-social','skyline-auto-spa','vibes-juice-co'
);

-- Shared read-only demo preview. No educator verification, member card,
-- wallet pass or administrator role is issued to this account.
INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,is_demo)
VALUES (
  gen_random_uuid(),'demo@teachersvip.net',
  'scrypt:81c1736ab99a104a4a938b123da75e86:c43ada7295552c3738bd9c2e8f8e795761a2e1d0671832f797cac19dc85383d3db7b035f24c5a88fe1abb123705f56383ee206b027530875259c783fb269cf88',
  'Demo','Preview','Houston, Texas',true
) ON CONFLICT (personal_email) DO NOTHING;
