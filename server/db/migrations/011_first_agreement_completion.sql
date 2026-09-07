ALTER TABLE users ADD COLUMN IF NOT EXISTS email_updates boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  email citext PRIMARY KEY,
  subscribed boolean NOT NULL DEFAULT true,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_usage_limit_period_check;
ALTER TABLE deals ADD CONSTRAINT deals_usage_limit_period_check
  CHECK (usage_limit_period IN ('none','day','month','promo','lifetime'));

UPDATE businesses SET hours = CASE id
  WHEN 'island-spice' THEN 'Open now · Closes 9 PM.'
  WHEN 'glow-beauty' THEN 'Open now · Closes 7 PM.'
  WHEN 'cafe-101' THEN 'Open now · Closes 6 PM.'
  WHEN 'booknook' THEN 'Open now · Closes 8 PM.'
  WHEN 'district-social' THEN 'Open now · Closes 10 PM.'
  WHEN 'lounge-social' THEN 'Open now · Closes 10 PM.'
  WHEN 'skyline-auto-spa' THEN 'Open now · Closes 6 PM.'
  WHEN 'vibes-juice-co' THEN 'Open now · Closes 7 PM.'
  ELSE hours END
WHERE id IN ('island-spice','glow-beauty','cafe-101','booknook','district-social','lounge-social','skyline-auto-spa','vibes-juice-co');

UPDATE deals SET
  title = CASE id
    WHEN 'island-spice-20' THEN '20% OFF Your Meal'
    WHEN 'glow-beauty-10' THEN '15% OFF Any Service'
    WHEN 'cafe-101-2' THEN 'Free Pastry With Any Drink'
    WHEN 'booknook-15' THEN '20% OFF All Online Orders'
    WHEN 'teacher-tech-25' THEN '15% OFF Your Purchase'
    WHEN 'teacher-tech-giveaway' THEN 'Monthly Giveaway: Lunch or Dinner for Two'
    WHEN 'district-social-perk' THEN 'Buy One, Get One Admission'
    WHEN 'lounge-social-perk' THEN '20% OFF Food for Educators'
    WHEN 'skyline-auto-spa-perk' THEN 'Free Premium Wash for Educators'
    WHEN 'vibes-juice-co-perk' THEN '15% OFF Any Order'
    ELSE title END,
  description = CASE id
    WHEN 'island-spice-20' THEN 'Save 20% on your meal at Ember & Oak.'
    WHEN 'glow-beauty-10' THEN 'Save 15% on any eligible service at Luxe Theory.'
    WHEN 'cafe-101-2' THEN 'Receive a free pastry with any drink purchase.'
    WHEN 'booknook-15' THEN 'Save 20% on all eligible online orders.'
    WHEN 'teacher-tech-25' THEN 'Save 15% on your eligible online purchase.'
    WHEN 'teacher-tech-giveaway' THEN 'Enter the monthly giveaway for lunch or dinner for two.'
    WHEN 'district-social-perk' THEN 'Buy one admission and receive a second admission free.'
    WHEN 'lounge-social-perk' THEN 'Save 20% on eligible food purchases.'
    WHEN 'skyline-auto-spa-perk' THEN 'Receive one free premium car wash.'
    WHEN 'vibes-juice-co-perk' THEN 'Save 15% on any eligible order.'
    ELSE description END,
  usage_limit_count = CASE id
    WHEN 'glow-beauty-10' THEN 1 WHEN 'cafe-101-2' THEN 1
    WHEN 'teacher-tech-giveaway' THEN 1 WHEN 'district-social-perk' THEN 1
    WHEN 'skyline-auto-spa-perk' THEN 1 ELSE NULL END,
  usage_limit_period = CASE id
    WHEN 'glow-beauty-10' THEN 'month' WHEN 'cafe-101-2' THEN 'day'
    WHEN 'teacher-tech-giveaway' THEN 'month' WHEN 'district-social-perk' THEN 'day'
    WHEN 'skyline-auto-spa-perk' THEN 'lifetime' ELSE 'none' END
WHERE id IN ('island-spice-20','glow-beauty-10','cafe-101-2','booknook-15','teacher-tech-25','teacher-tech-giveaway','district-social-perk','lounge-social-perk','skyline-auto-spa-perk','vibes-juice-co-perk');
