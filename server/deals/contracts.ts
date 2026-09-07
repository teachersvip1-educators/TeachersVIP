export type DealLimitPeriod = 'none' | 'day' | 'month' | 'promo' | 'lifetime'
export type DealLimitScope = 'offer' | 'location'
export type RedemptionMethod = 'pos_button' | 'coupon_code' | 'barcode' | 'cashier_instruction'
export type TrackingMode = 'standard_geolocation' | 'enhanced_pos' | 'online'

export interface ActivateDealRequest {
  locationId?: string
  latitude?: number
  longitude?: number
  accuracyM?: number
  observedAt?: string
  idempotencyKey: string
}

export interface ActivationSuccess {
  ok: true
  activationType: 'verified_on_site' | 'online_offer_access'
  activationId: string
  status: 'Location Verified' | 'Online Offer Access'
  businessId: string
  locationId: string | null
  distanceM: number | null
  accuracyM: number | null
  redemptionMethod: RedemptionMethod
  redemptionPayload: string | null
  expiresAt: string
  usageBucket: string | null
  usageCount: number
  note: string
}

export interface ActivationDenied {
  ok: false
  activationId: string
  reason: 'location_permission_required' | 'invalid_location' | 'stale_location' | 'low_accuracy' | 'outside_radius' | 'limit_reached' | 'deal_unavailable' | 'location_unavailable' | 'activation_in_progress' | 'activation_expired'
  message: string
  retryable: boolean
  distanceM?: number | null
  accuracyM?: number | null
  retryAfterAt?: string | null
}

export type ActivationResponse = ActivationSuccess | ActivationDenied
