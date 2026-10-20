/** Server-side proximity checks for a browser location observation. */

export type GeolocationDecision = 'inside' | 'outside' | 'stale' | 'low_accuracy' | 'invalid'

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface GeolocationObservation extends Coordinates {
  /** Browser-reported horizontal accuracy in metres. */
  accuracyM: number
  /** The browser's observation timestamp, not the request arrival time. */
  observedAt: Date | string
}

export interface ProximityCheckInput {
  observation: GeolocationObservation
  target: Coordinates
  radiusM: number
  now?: Date
  maxAgeMs?: number
  maxFutureSkewMs?: number
}

export interface ProximityCheckResult {
  decision: GeolocationDecision
  distanceM: number | null
  accuracyM: number | null
  observedAt: Date | null
  reason: string
}

const EARTH_RADIUS_M = 6_371_008.8

function validCoordinate(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

function parseObservationDate(value: Date | string): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Great-circle distance, in metres, using the Haversine formula. */
export function haversineDistanceM(from: Coordinates, to: Coordinates): number {
  const lat1 = from.latitude * Math.PI / 180
  const lat2 = to.latitude * Math.PI / 180
  const dLat = (to.latitude - from.latitude) * Math.PI / 180
  const dLon = (to.longitude - from.longitude) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

/**
 * A location is accepted only when the entire accuracy circle is inside the
 * approved radius. Near-boundary observations are retried instead of being
 * incorrectly labelled outside.
 */
export function validateProximity(input: ProximityCheckInput): ProximityCheckResult {
  const now = input.now ?? new Date()
  const maxAgeMs = input.maxAgeMs ?? 120_000
  const maxFutureSkewMs = input.maxFutureSkewMs ?? 30_000
  const { observation, target, radiusM } = input
  const observedAt = parseObservationDate(observation.observedAt)

  if (!validCoordinate(observation.latitude, -90, 90) || !validCoordinate(observation.longitude, -180, 180)
    || !validCoordinate(target.latitude, -90, 90) || !validCoordinate(target.longitude, -180, 180)
    || !Number.isFinite(radiusM) || radiusM <= 0
    || !Number.isFinite(observation.accuracyM) || observation.accuracyM < 0
    || !observedAt) {
    return { decision: 'invalid', distanceM: null, accuracyM: null, observedAt, reason: 'invalid_location_observation' }
  }

  const ageMs = now.getTime() - observedAt.getTime()
  if (ageMs > maxAgeMs) return { decision: 'stale', distanceM: null, accuracyM: observation.accuracyM, observedAt, reason: 'location_observation_is_stale' }
  if (ageMs < -maxFutureSkewMs) return { decision: 'invalid', distanceM: null, accuracyM: observation.accuracyM, observedAt, reason: 'location_observation_is_from_the_future' }

  const distanceM = haversineDistanceM(observation, target)
  if (distanceM - observation.accuracyM > radiusM) {
    return { decision: 'outside', distanceM, accuracyM: observation.accuracyM, observedAt, reason: 'outside_approved_radius' }
  }
  if (distanceM + observation.accuracyM > radiusM) {
    return { decision: 'low_accuracy', distanceM, accuracyM: observation.accuracyM, observedAt, reason: 'accuracy_does_not_support_confident_proximity' }
  }
  return { decision: 'inside', distanceM, accuracyM: observation.accuracyM, observedAt, reason: 'inside_approved_radius' }
}
