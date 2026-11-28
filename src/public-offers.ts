import type { DiscoverMarketId } from "../shared/discover-markets"

export type PublicOffer = {
  id: string
  marketIds: readonly DiscoverMarketId[]
  businessName: string
  title: string
  category: "Food & Drink" | "Shopping" | "Services" | "Sports & Events"
  location: string
  details: string
  providerUrl: string
  providerLabel?: string
}

const TEACHER_TUESDAYS = {
  title: "Teacher Tuesdays",
  category: "Sports & Events",
  details: "Check the location’s event calendar for upcoming dates and bring your school ID.",
  providerLabel: "Check event dates",
} as const

const TEACHER_APPRECIATION_PACKAGE = "https://mdtproject.org/businesses-that-support-teachers/"

export const PUBLIC_OFFERS: readonly PublicOffer[] = [
  {
    id: "childrens-museum-houston",
    marketIds: ["houston"],
    businessName: "Children’s Museum Houston",
    title: "$15 off any membership",
    category: "Sports & Events",
    location: "Houston, TX",
    details: "Show your employee ID in person at the museum’s Welcome Center.",
    providerUrl: "https://www.cmhouston.org/educators",
  },
  {
    ...TEACHER_TUESDAYS,
    id: "dave-and-busters-houston",
    marketIds: ["houston"],
    businessName: "Dave & Buster’s Houston",
    location: "Houston, TX",
    providerUrl: "https://www.prekindle.com/events/daveandbusters-houston",
  },
  {
    id: "half-price-books",
    marketIds: ["houston", "dallas-fort-worth"],
    businessName: "Half Price Books",
    title: "10% off with an Educator Discount Card",
    category: "Shopping",
    location: "Texas stores",
    details: "Apply in store with a current school or library ID or pay stub. The card applies to in-store purchases.",
    providerUrl: "https://www.hpb.com/our-culture.html",
  },
  {
    id: "texas-de-brazil",
    marketIds: ["houston", "dallas-fort-worth", "miami", "orlando", "tampa"],
    businessName: "Texas de Brazil",
    title: "10% off dine-in prices for teachers",
    category: "Food & Drink",
    location: "Participating U.S. locations",
    details: "Show a valid teacher ID for the discount on dine-in lunch or dinner. Holiday and other restrictions apply.",
    providerUrl: "https://texasdebrazil.com/specials/heroes-discount/",
  },
  {
    ...TEACHER_TUESDAYS,
    id: "dave-and-busters-new-orleans",
    marketIds: ["new-orleans"],
    businessName: "Dave & Buster’s New Orleans",
    location: "New Orleans, LA",
    providerUrl: "https://www.prekindle.com/events/daveandbusters-neworleans",
  },
  {
    id: "pinedas-auto-glass",
    marketIds: ["phoenix"],
    businessName: "Pineda’s Auto Glass",
    title: "10% off",
    category: "Services",
    location: "Phoenix, AZ",
    details: "Ask the Phoenix shop about the educator discount when requesting service.",
    providerUrl: TEACHER_APPRECIATION_PACKAGE,
  },
  {
    id: "tap-that-downtown",
    marketIds: ["phoenix"],
    businessName: "Tap That Downtown",
    title: "15% off on-site food and beverage",
    category: "Food & Drink",
    location: "Phoenix, AZ",
    details: "Ask for the educator discount when ordering on site.",
    providerUrl: TEACHER_APPRECIATION_PACKAGE,
  },
  {
    ...TEACHER_TUESDAYS,
    id: "dave-and-busters-phoenix",
    marketIds: ["phoenix"],
    businessName: "Dave & Buster’s Phoenix",
    location: "Phoenix, AZ",
    providerUrl: "https://www.prekindle.com/events/daveandbusters-phoenix",
  },
  {
    id: "newfields",
    marketIds: ["indianapolis"],
    businessName: "Newfields",
    title: "10% off memberships for teachers",
    category: "Sports & Events",
    location: "Indianapolis, IN",
    details: "Contact the Membership Department or visit the Newfields Info Desk to apply the teacher discount.",
    providerUrl: "https://discovernewfields.org/membership-faq",
  },
  {
    id: "meineke-mesa",
    marketIds: ["mesa"],
    businessName: "Meineke Mesa",
    title: "15% off services, excluding tires",
    category: "Services",
    location: "Mesa, AZ",
    details: "Ask for the educator discount at the participating shop at 4454 E University Ave.",
    providerUrl: TEACHER_APPRECIATION_PACKAGE,
  },
  {
    id: "museum-of-illusions-new-orleans",
    marketIds: ["new-orleans"],
    businessName: "Museum of Illusions New Orleans",
    title: "Teacher Appreciation Offer",
    category: "Sports & Events",
    location: "New Orleans, LA",
    details: "Eligible teachers and educators can get one free walk-in admission per year with a valid school ID. Check current eligibility before visiting.",
    providerUrl: "https://moineworleans.com/faq/",
  },
  {
    id: "kid-museum",
    marketIds: ["bethesda", "maryland"],
    businessName: "KID Museum",
    title: "Educator discount on family programming",
    category: "Sports & Events",
    location: "Bethesda, MD",
    details: "Use the museum’s Access for Every Maker form to confirm whether the advertised 20% applies to your program before booking.",
    providerUrl: "https://kid-museum.org/visit/",
    providerLabel: "Check educator eligibility",
  },
  {
    id: "national-wwii-museum",
    marketIds: ["new-orleans"],
    businessName: "The National WWII Museum",
    title: "Educator Appreciation Event",
    category: "Sports & Events",
    location: "New Orleans, LA",
    details: "Check the museum’s educator calendar for the next event date and registration details.",
    providerUrl: "https://www.nationalww2museum.org/events-programs/programs/students-teachers",
    providerLabel: "Check for the next date",
  },
  {
    ...TEACHER_TUESDAYS,
    id: "dave-and-busters-indianapolis",
    marketIds: ["indianapolis"],
    businessName: "Dave & Buster’s Indianapolis",
    location: "Indianapolis, IN",
    providerUrl: "https://www.prekindle.com/events/daveandbusters-indianapolis",
  },
  {
    id: "arizona-grand-resort",
    marketIds: ["phoenix"],
    businessName: "Arizona Grand Resort",
    title: "Educator rate",
    category: "Services",
    location: "Phoenix, AZ",
    details: "Check the resort’s current educator rate, availability and eligibility for your travel dates.",
    providerUrl: "https://www.arizonagrandresort.com/educator-discount/",
    providerLabel: "Check the educator rate",
  },
  {
    id: "national-museum-of-women-in-the-arts",
    marketIds: ["washington-dc"],
    businessName: "National Museum of Women in the Arts",
    title: "Discounted educator admission",
    category: "Sports & Events",
    location: "Washington, DC",
    details: "Select educator admission when reserving and bring a valid ID. Check the museum’s visitor FAQ for current prices and guest eligibility.",
    providerUrl: "https://nmwa.org/visit/visitor-faqs/",
  },
]

export function publicOffersForMarket(marketId: DiscoverMarketId): PublicOffer[] {
  return PUBLIC_OFFERS.filter((offer) => offer.marketIds.includes(marketId))
}
