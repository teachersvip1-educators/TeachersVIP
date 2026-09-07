import { getConfig } from '../config.js'
import { createPool } from './pool.js'
import { encrypt } from '../security.js'


const businesses: Array<Array<string | number | boolean | null>> = [
  ['island-spice', 'Ember & Oak', 'Dining', 'A warm, wood-fired kitchen serving generous plates, bright flavours, and an educator-friendly welcome.', '/Ember&Oak.jpeg', 'https://example.com', 'Houston, TX', 'Open now · Closes 9 PM.', true, 'Houston, Texas', 29.7604, -95.3698],
  ['glow-beauty', 'Luxe Theory', 'Services', 'A considered salon experience for hair, colour, and skincare appointments.', '/LuxeTheory.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · Closes 7 PM.', true, 'Dallas, Texas', 32.7767, -96.797],
  ['cafe-101', 'Golden Hour Coffee', 'Coffee', 'A neighbourhood coffee stop for smooth espresso, iced drinks, and a slow start to the day.', '/GoldenHourCoffee.jpeg', 'https://example.com', 'Houston, TX', 'Open now · Closes 6 PM.', true, 'Houston, Texas', 29.7604, -95.3698],
  ['booknook', 'The Teacher Edit', 'Retail', 'A thoughtful collection of books, teacher gifts, and classroom essentials for the everyday educator.', '/The Teacher Edit.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · Closes 8 PM.', true, 'Dallas, Texas', 32.7767, -96.797],
  ['teacher-tech', 'Sunday Supply', 'Online', 'Practical digital classroom tools and educator resources designed to make teaching days run more smoothly.', '/SundaySupply.jpeg', 'https://example.com', null, null, null, null, null, null],
  ['district-social', 'District Social', 'Dining', 'A relaxed neighbourhood social space for good food, easy conversation, and time well spent.', '/DistrictSocial.jpeg', 'https://example.com', 'Austin, TX', 'Open now · Closes 10 PM.', true, 'Austin, Texas', 30.2672, -97.7431],
  ['lounge-social', 'Lounge & Social', 'Dining', 'A welcoming lounge for casual gatherings, shared plates, and after-work catch-ups.', '/Lounge&Social.jpeg', 'https://example.com', 'Houston, TX', 'Open now · Closes 10 PM.', true, 'Houston, Texas', 29.7604, -95.3698],
  ['skyline-auto-spa', 'Skyline Auto Spa', 'Services', 'A polished car-care experience for keeping your everyday drive looking its best.', '/SkylineAutoSpa.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · Closes 6 PM.', true, 'Dallas, Texas', 32.7767, -96.797],
  ['vibes-juice-co', 'Vibes Juice Co', 'Dining', 'Fresh juices, bright blends, and easy nourishment for busy teaching days.', '/VibesJuiceCo.jpeg', 'https://example.com', 'Austin, TX', 'Open now · Closes 7 PM.', true, 'Austin, Texas', 30.2672, -97.7431],
]

const deals: Array<Array<string | number | boolean | null>> = [
  ['island-spice-20', 'island-spice', '20% OFF Your Meal', 'Save 20% on your meal at Ember & Oak.', 'in_person', 'Dining', 'Valid for verified educators on eligible dine-in purchases.', null, 500, true, false, false, null, 'none'],
  ['glow-beauty-10', 'glow-beauty', '15% OFF Any Service', 'Save 15% on any eligible service at Luxe Theory.', 'in_person', 'Services', 'Appointment required. Excludes retail products.', null, 1200, false, true, false, 1, 'month'],
  ['cafe-101-2', 'cafe-101', 'Free Pastry With Any Drink', 'Receive a free pastry with any drink purchase.', 'in_person', 'Coffee', 'Valid on an eligible pastry while supplies last.', null, 500, true, false, false, 1, 'day'],
  ['booknook-15', 'booknook', '20% OFF All Online Orders', 'Save 20% on all eligible online orders.', 'online', 'Online', 'Excludes gift cards and special orders.', 'TEACHER20', 1000, false, false, false, null, 'none'],
  ['teacher-tech-25', 'teacher-tech', '15% OFF Your Purchase', 'Save 15% on your eligible online purchase.', 'online', 'Online', 'Exclusions may apply on the partner website.', 'EDUCATOR15', 1500, true, false, false, null, 'none'],
  ['teacher-tech-giveaway', 'teacher-tech', 'Monthly Giveaway: Lunch or Dinner for Two', 'Enter the monthly giveaway for lunch or dinner for two.', 'online', 'Win', 'One entry each month per verified educator.', null, 10000, false, false, true, 1, 'month'],
  ['district-social-perk', 'district-social', 'Buy One, Get One Admission', 'Buy one admission and receive a second admission free.', 'in_person', 'Dining', 'Valid for verified educators. Equal or lower-priced admission is free.', null, 1500, false, false, false, 1, 'day'],
  ['lounge-social-perk', 'lounge-social', '20% OFF Food for Educators', 'Save 20% on eligible food purchases.', 'in_person', 'Dining', 'Dine-in food only. Excludes alcohol and gratuity.', null, 800, false, false, false, null, 'none'],
  ['skyline-auto-spa-perk', 'skyline-auto-spa', 'Free Premium Wash for Educators', 'Receive one free premium car wash.', 'in_person', 'Services', 'One-time offer for the verified educator member.', null, 2200, false, false, false, 1, 'lifetime'],
  ['vibes-juice-co-perk', 'vibes-juice-co', '15% OFF Any Order', 'Save 15% on any eligible order.', 'in_person', 'Dining', 'Valid on eligible menu purchases.', null, 300, false, false, false, null, 'none'],
]

export async function seed() {
  const config = getConfig()
  const pool = createPool(config)
  try {
    for (const row of businesses) {
      await pool.query(`INSERT INTO businesses(id,name,category,description,image_url,website_url,distance,hours,is_open,address,latitude,longitude)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, image_url=EXCLUDED.image_url, address=EXCLUDED.address, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude`, row)
      if (row[9] && row[10] != null && row[11] != null) await pool.query(`INSERT INTO business_locations(id,business_id,location_name,address,timezone,latitude,longitude,geofence_radius_m,active)
        VALUES($1,$2,'Primary location',$3,'America/Chicago',$4,$5,150,true)
        ON CONFLICT (id) DO UPDATE SET address=EXCLUDED.address,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,active=true,updated_at=now()`, [`${row[0]}:primary`, row[0], row[9], row[10], row[11]])
    }
    for (const original of deals) {
      const row = [...original]
      const channel = String(row[4])
      const promoCode = typeof row[7] === 'string' ? row[7] : null
      const redemptionMethod = promoCode ? 'coupon_code' : 'cashier_instruction'
      const redemptionText = promoCode || (channel === 'online' ? 'Follow the offer instructions on the business website.' : 'Ask the cashier to apply the TeachersVIP educator offer in the normal POS.')
      const encryptedPromo = promoCode ? encrypt(promoCode, config.DATA_ENCRYPTION_KEY) : null
      const usageLimitCount = row[12] as number | null
      const usageLimitPeriod = String(row[13])
      const values = [...row.slice(0, 7), encryptedPromo, ...row.slice(8, 12), redemptionMethod, encrypt(redemptionText, config.DATA_ENCRYPTION_KEY), 300, usageLimitCount, usageLimitPeriod, 'offer', channel === 'online' ? 'online' : 'standard_geolocation']
      await pool.query(`INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,promo_code_encrypted,estimated_savings_cents,featured,sponsored,giveaway,redemption_method,redemption_payload_encrypted,display_ttl_seconds,usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,restrictions=EXCLUDED.restrictions,giveaway=EXCLUDED.giveaway,promo_code_encrypted=EXCLUDED.promo_code_encrypted,redemption_method=EXCLUDED.redemption_method,redemption_payload_encrypted=EXCLUDED.redemption_payload_encrypted,display_ttl_seconds=EXCLUDED.display_ttl_seconds,usage_limit_count=EXCLUDED.usage_limit_count,usage_limit_period=EXCLUDED.usage_limit_period,usage_limit_scope=EXCLUDED.usage_limit_scope,tracking_mode=EXCLUDED.tracking_mode`, values)
      if (channel === 'in_person') await pool.query('INSERT INTO deal_locations(deal_id,business_location_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [row[0], `${row[1]}:primary`])
    }
  } finally { await pool.end() }
}

if (import.meta.url.endsWith(process.argv[1]?.replaceAll('\\', '/') ?? '')) {
  seed().then(() => console.log('Seed data ready.')).catch(error => { console.error(error); process.exit(1) })
}
