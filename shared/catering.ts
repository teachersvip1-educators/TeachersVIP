export type CateringListing = {
  business_id: string
  name: string
  description: string
  image_url: string
  website_url: string | null
  market_id: string
  service_area: string
  perk: string
  minimum_guests: number | null
  lead_time: string
  delivery_options: string
}

export type CateringRequest = {
  id: string
  business_id: string
  business_name: string
  market_id: string
  school_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  event_type: string
  event_date: string
  event_time: string
  guest_count: number
  budget: string
  delivery_address: string
  dietary_requirements: string
  notes: string
  status: "new" | "contacted" | "closed"
  notification_sent_at: string | null
  created_at: string
}
