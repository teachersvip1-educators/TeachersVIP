import { getConfig } from '../config.js'
import { createPool } from './pool.js'
import { encrypt } from '../security.js'


const businesses = [
  ['island-spice', 'Ember & Oak', 'Dining', 'A warm, wood-fired kitchen serving generous plates, bright flavours, and an educator-friendly welcome.', '/Ember&Oak.jpeg', 'https://example.com', 'Houston, TX', 'Open now · closes 9 PM', true, 'Houston, Texas', 29.7604, -95.3698],
  ['glow-beauty', 'Luxe Theory', 'Services', 'A considered salon experience for hair, colour, and skincare appointments.', '/LuxeTheory.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · closes 7 PM', true, 'Dallas, Texas', 32.7767, -96.797],
  ['cafe-101', 'Golden Hour Coffee', 'Coffee', 'A neighbourhood coffee stop for smooth espresso, iced drinks, and a slow start to the day.', '/GoldenHourCoffee.jpeg', 'https://example.com', 'Houston, TX', 'Open now · closes 6 PM', true, 'Houston, Texas', 29.7604, -95.3698],
  ['booknook', 'The Teacher Edit', 'Retail', 'A thoughtful collection of books, teacher gifts, and classroom essentials for the everyday educator.', '/The Teacher Edit.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · closes 8 PM', true, 'Dallas, Texas', 32.7767, -96.797],
  ['teacher-tech', 'Sunday Supply', 'Online', 'Practical digital classroom tools and educator resources designed to make teaching days run more smoothly.', '/SundaySupply.jpeg', 'https://example.com', null, null, null, null, null, null],
  ['district-social', 'District Social', 'Dining', 'A relaxed neighbourhood social space for good food, easy conversation, and time well spent.', '/DistrictSocial.jpeg', 'https://example.com', 'Austin, TX', 'Open now · closes 10 PM', true, 'Austin, Texas', 30.2672, -97.7431],
  ['lounge-social', 'Lounge & Social', 'Dining', 'A welcoming lounge for casual gatherings, shared plates, and after-work catch-ups.', '/Lounge&Social.jpeg', 'https://example.com', 'Houston, TX', 'Open now · closes 10 PM', true, 'Houston, Texas', 29.7604, -95.3698],
  ['skyline-auto-spa', 'Skyline Auto Spa', 'Services', 'A polished car-care experience for keeping your everyday drive looking its best.', '/SkylineAutoSpa.jpeg', 'https://example.com', 'Dallas, TX', 'Open now · closes 6 PM', true, 'Dallas, Texas', 32.7767, -96.797],
  ['vibes-juice-co', 'Vibes Juice Co', 'Dining', 'Fresh juices, bright blends, and easy nourishment for busy teaching days.', '/VibesJuiceCo.jpeg', 'https://example.com', 'Austin, TX', 'Open now · closes 7 PM', true, 'Austin, Texas', 30.2672, -97.7431],
]

const deals = [
  ['island-spice-20', 'island-spice', '20% OFF Any Entrée', 'Save on any dine-in entrée.', 'in_person', 'Dining', 'Valid for verified educators. One offer per visit.', null, 500, true, false, false],
  ['glow-beauty-10', 'glow-beauty', '15% OFF All Services', 'Save 15% on salon and spa services.', 'in_person', 'Services', 'Appointment required. Excludes retail products.', null, 1200, false, true, false],
  ['cafe-101-2', 'cafe-101', '$2 OFF Any Drink', 'Choose any handcrafted drink.', 'in_person', 'Coffee', 'One drink per educator per visit.', null, 200, true, false, false],
  ['booknook-15', 'booknook', '15% OFF Purchase', 'Save on books and educator gifts.', 'in_person', 'Retail', 'Excludes gift cards and special orders.', null, 750, false, false, false],
  ['teacher-tech-25', 'teacher-tech', '25% OFF Annual Plan', 'Access classroom resources online.', 'online', 'Online', 'New annual subscriptions only.', 'EDUCATOR25', 2500, true, false, false],
  ['teacher-tech-giveaway', 'teacher-tech', 'Enter to Win a Classroom Toolkit', 'Enter for chances to win free meals, experiences, gift cards, and more.', 'online', 'Win', 'One entry per verified educator.', null, 5000, false, false, true],
  ['district-social-perk', 'district-social', 'Educator Partner Offer', 'Discover a social space made for easy meals, meet-ups, and time off.', 'in_person', 'Dining', 'Ask the business for current educator offer details.', null, 0, false, false, false],
  ['lounge-social-perk', 'lounge-social', 'Educator Partner Offer', 'Settle in for a relaxed meal, shared plates, or an after-work catch-up.', 'in_person', 'Dining', 'Ask the business for current educator offer details.', null, 0, false, false, false],
  ['skyline-auto-spa-perk', 'skyline-auto-spa', 'Educator Partner Offer', 'Give your car a polished finish with a considered local auto-care experience.', 'in_person', 'Services', 'Ask the business for current educator offer details.', null, 0, false, false, false],
  ['vibes-juice-co-perk', 'vibes-juice-co', 'Educator Partner Offer', 'Find a bright, fresh pick-me-up for the school day.', 'in_person', 'Dining', 'Ask the business for current educator offer details.', null, 0, false, false, false],
]

export async function seed() {
  const config = getConfig()
  const pool = createPool(config)
  try {
    for (const row of businesses) {
      await pool.query(`INSERT INTO businesses(id,name,category,description,image_url,website_url,distance,hours,is_open,address,latitude,longitude)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, image_url=EXCLUDED.image_url, address=EXCLUDED.address, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude`, row)
    }
    for (const original of deals) {
      const row = [...original]
      if (typeof row[7] === 'string') row[7] = encrypt(row[7], config.DATA_ENCRYPTION_KEY)
      await pool.query(`INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,promo_code_encrypted,estimated_savings_cents,featured,sponsored,giveaway)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, category=EXCLUDED.category, restrictions=EXCLUDED.restrictions, giveaway=EXCLUDED.giveaway`, row)
    }
  } finally { await pool.end() }
}

if (import.meta.url.endsWith(process.argv[1]?.replaceAll('\\', '/') ?? '')) {
  seed().then(() => console.log('Seed data ready.')).catch(error => { console.error(error); process.exit(1) })
}
