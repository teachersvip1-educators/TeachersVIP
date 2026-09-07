import { randomUUID } from "node:crypto"
import { validateProximity, type ProximityCheckResult } from "./geolocation.js"
import {
  getUsageBucket,
  usageScopeKey,
  consumeUsageLimit,
  type Queryable,
} from "./usage.js"
import type {
  ActivateDealRequest,
  ActivationDenied,
  ActivationResponse,
  ActivationSuccess,
  DealLimitPeriod,
  DealLimitScope,
  RedemptionMethod,
  TrackingMode,
} from "./contracts.js"

interface DealRow {
  id: string
  business_id: string
  channel: "in_person" | "online"
  redemption_method: RedemptionMethod
  redemption_payload_encrypted: string | null
  display_ttl_seconds: number
  usage_limit_count: number | null
  usage_limit_period: DealLimitPeriod
  usage_limit_scope: DealLimitScope
  tracking_mode: TrackingMode
  starts_at: Date | string | null
  ends_at: Date | string | null
}

interface LocationRow {
  id: string
  business_id: string
  timezone: string
  latitude: number | null
  longitude: number | null
  geofence_radius_m: number
  active: boolean
}

interface StoredActivation {
  id: string
  outcome: "pending" | "successful" | "denied"
  activation_type: "verified_on_site" | "online_offer_access"
  business_id: string
  business_location_id: string | null
  location_decision: string
  distance_m: number | null
  reported_accuracy_m: number | null
  redemption_payload_encrypted: string | null
  payload_expires_at: Date | string | null
  usage_bucket: string | null
  usage_counted: boolean
  created_at: Date | string
}

export interface ActivateDealOptions {
  db: Queryable
  userId: string
  dealId: string
  request: ActivateDealRequest
  now?: Date
  /** Encrypts exact submitted coordinates for short-lived audit evidence. */
  encryptCoordinate?: (coordinate: number) => string
  /** Decrypts the configured redemption content only for a successful response. */
  decryptPayload?: (encrypted: string) => string
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function dateIso(value: Date | string | null | undefined): string | null {
  const date = asDate(value)
  return date?.toISOString() ?? null
}

function denialReason(decision: string): ActivationDenied["reason"] {
  if (decision === "stale") return "stale_location"
  if (decision === "low_accuracy") return "low_accuracy"
  if (decision === "outside") return "outside_radius"
  if (decision === "unavailable") return "location_unavailable"
  if (decision === "limit_reached") return "limit_reached"
  if (decision === "invalid") return "invalid_location"
  return "deal_unavailable"
}

function denialMessage(reason: ActivationDenied["reason"]): string {
  const messages: Record<ActivationDenied["reason"], string> = {
    location_permission_required:
      "Allow location access to verify that you are at this business.",
    invalid_location:
      "We could not use that location reading. Please try again.",
    stale_location:
      "That location reading is out of date. Please try again at the business.",
    low_accuracy:
      "Your location is not accurate enough yet. Move outside or turn on precise location, then try again.",
    outside_radius:
      "You are outside the approved offer location. The deal will not unlock here.",
    limit_reached:
      "You have reached this offer’s usage limit for the current period.",
    deal_unavailable: "This deal is not available right now.",
    location_unavailable:
      "This business location does not have a verified geofence yet.",
    activation_in_progress:
      "Your activation is still being processed. Please try again shortly.",
    activation_expired:
      "This activation has expired. Start a new activation to request a fresh code.",
  }
  return messages[reason]
}

function denied(
  activationId: string,
  decision: ActivationDenied["reason"],
  options: Partial<ActivationDenied> = {},
): ActivationDenied {
  return {
    ok: false,
    activationId,
    reason: decision,
    message: denialMessage(decision),
    retryable: [
      "stale_location",
      "low_accuracy",
      "location_permission_required",
      "location_unavailable",
      "activation_in_progress",
    ].includes(decision),
    ...options,
  }
}

function successful(
  row: StoredActivation,
  options: ActivateDealOptions,
  deal: DealRow,
): ActivationSuccess {
  const expiresAt = dateIso(row.payload_expires_at)!
  let redemptionPayload: string | null =
    deal.redemption_method === "pos_button"
      ? "Tap the TeachersVIP discount button in the normal POS."
      : deal.redemption_method === "cashier_instruction"
        ? "Apply the TeachersVIP educator offer in the normal POS."
        : null
  if (row.redemption_payload_encrypted && options.decryptPayload)
    redemptionPayload = options.decryptPayload(row.redemption_payload_encrypted)
  return {
    ok: true,
    activationType: row.activation_type,
    activationId: row.id,
    status:
      row.activation_type === "verified_on_site"
        ? "Location Verified"
        : "Online Offer Access",
    businessId: row.business_id,
    locationId: row.business_location_id,
    distanceM: row.distance_m,
    accuracyM: row.reported_accuracy_m,
    redemptionMethod: deal.redemption_method,
    redemptionPayload,
    expiresAt,
    usageBucket: row.usage_bucket,
    usageCount: row.usage_counted ? 1 : 0,
    note:
      row.activation_type === "verified_on_site"
        ? "Verified on-site deal activation; this does not confirm a completed purchase."
        : "Online offer access; this does not confirm a completed purchase.",
  }
}

function storedResult(
  row: StoredActivation,
  options: ActivateDealOptions,
  deal: DealRow,
  now: Date,
): ActivationResponse {
  if (row.outcome === "successful") {
    const expiresAt = asDate(row.payload_expires_at)
    if (!expiresAt || expiresAt <= now)
      return denied(row.id, "activation_expired", {
        retryable: true,
        retryAfterAt: expiresAt?.toISOString() ?? null,
      })
    return successful(row, options, deal)
  }
  if (row.outcome === "pending") return denied(row.id, "activation_in_progress")
  return denied(row.id, denialReason(row.location_decision), {
    distanceM: row.distance_m,
    accuracyM: row.reported_accuracy_m,
  })
}

async function findStoredActivation(
  db: Queryable,
  userId: string,
  dealId: string,
  key: string,
): Promise<StoredActivation | null> {
  const result = await db.query<StoredActivation>(
    `SELECT id,outcome,activation_type,business_id,business_location_id,location_decision,
    distance_m,reported_accuracy_m,redemption_payload_encrypted,payload_expires_at,usage_bucket,usage_counted,created_at
    FROM deal_activations WHERE user_id=$1 AND deal_id=$2 AND idempotency_key=$3`,
    [userId, dealId, key],
  )
  return result.rows[0] ?? null
}

async function insertDenied(
  options: ActivateDealOptions,
  input: {
    id: string
    userId: string
    deal: DealRow
    locationId: string | null
    decision: string
    distanceM: number | null
    accuracyM: number | null
    observedAt: Date | null
    idempotencyKey: string
    latitude?: number
    longitude?: number
    reason?: string
  },
): Promise<ActivationResponse> {
  await options.db.query(
    `INSERT INTO deal_activations(id,user_id,deal_id,business_id,business_location_id,activation_type,idempotency_key,outcome,location_decision,
    submitted_latitude_encrypted,submitted_longitude_encrypted,location_observed_at,reported_accuracy_m,distance_m,risk_metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,'denied',$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (user_id,deal_id,idempotency_key) DO NOTHING`,
    [
      input.id,
      input.userId,
      input.deal.id,
      input.deal.business_id,
      input.locationId,
      input.deal.channel === "online"
        ? "online_offer_access"
        : "verified_on_site",
      input.idempotencyKey,
      input.decision,
      input.latitude == null || !options.encryptCoordinate
        ? null
        : options.encryptCoordinate(input.latitude),
      input.longitude == null || !options.encryptCoordinate
        ? null
        : options.encryptCoordinate(input.longitude),
      input.observedAt,
      input.accuracyM,
      input.distanceM,
      JSON.stringify({ reason: input.reason ?? input.decision }),
    ],
  )
  const existing = await findStoredActivation(
    options.db,
    input.userId,
    input.deal.id,
    input.idempotencyKey,
  )
  if (existing)
    return storedResult(
      existing,
      options,
      input.deal,
      options.now ?? new Date(),
    )
  return denied(input.id, denialReason(input.decision), {
    distanceM: input.distanceM,
    accuracyM: input.accuracyM,
  })
}

/**
 * Performs one activation. The caller MUST run this function inside a
 * PostgreSQL transaction and commit only after it returns. The pending-row
 * claim happens before the usage counter, making retries idempotent even when
 * the configured offer has no finite limit.
 */
export async function activateDeal(
  options: ActivateDealOptions,
): Promise<ActivationResponse> {
  const now = options.now ?? new Date()
  const key = options.request.idempotencyKey
  const id = randomUUID()
  if (!key || key.length > 200) return denied(id, "invalid_location")

  const existing = await findStoredActivation(
    options.db,
    options.userId,
    options.dealId,
    key,
  )
  if (existing) {
    const dealResult = await options.db.query<DealRow>(
      "SELECT id,business_id,channel,redemption_method,redemption_payload_encrypted,display_ttl_seconds,usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode,starts_at,ends_at FROM deals WHERE id=$1",
      [options.dealId],
    )
    if (dealResult.rows[0])
      return storedResult(existing, options, dealResult.rows[0], now)
  }

  const dealResult = await options.db.query<DealRow>(
    `SELECT id,business_id,channel,redemption_method,redemption_payload_encrypted,display_ttl_seconds,
    usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode,starts_at,ends_at
    FROM deals WHERE id=$1 AND published AND (starts_at IS NULL OR starts_at <= $2) AND (ends_at IS NULL OR ends_at > $2)`,
    [options.dealId, now],
  )
  const deal = dealResult.rows[0]
  if (!deal) return denied(id, "deal_unavailable")

  let location: LocationRow | null = null
  if (deal.channel === "in_person") {
    if (!options.request.locationId) return denied(id, "location_unavailable")
    const locationResult = await options.db.query<LocationRow>(
      `SELECT bl.id,bl.business_id,bl.timezone,bl.latitude,bl.longitude,bl.geofence_radius_m,bl.active
      FROM deal_locations dl JOIN business_locations bl ON bl.id=dl.business_location_id
      WHERE dl.deal_id=$1 AND dl.business_location_id=$2 AND bl.business_id=$3 AND bl.active`,
      [deal.id, options.request.locationId, deal.business_id],
    )
    location = locationResult.rows[0] ?? null
    if (!location) return denied(id, "deal_unavailable")
    if (location.latitude == null || location.longitude == null)
      return denied(id, "location_unavailable")
  }

  if (deal.channel === "online") {
    const bucket = getUsageBucket({
      period: deal.usage_limit_period,
      at: now,
      timeZone: "UTC",
      promoStartsAt: deal.starts_at,
      promoEndsAt: deal.ends_at,
    })
    const usageKey =
      bucket.key ?? (deal.usage_limit_count == null ? null : "offer")
    // Online offers have no location identity; a malformed location-scoped
    // online configuration is safely enforced as offer-scoped instead of
    // throwing during activation.
    const scopeKey = usageScopeKey("offer")
    const claim = await options.db.query<{ id: string }>(
      `INSERT INTO deal_activations(id,user_id,deal_id,business_id,activation_type,idempotency_key,outcome,location_decision)
      VALUES($1,$2,$3,$4,'online_offer_access',$5,'pending','not_requested') ON CONFLICT (user_id,deal_id,idempotency_key) DO NOTHING RETURNING id`,
      [id, options.userId, deal.id, deal.business_id, key],
    )
    if (!claim.rowCount) {
      const retry = await findStoredActivation(
        options.db,
        options.userId,
        deal.id,
        key,
      )
      return retry
        ? storedResult(retry, options, deal, now)
        : denied(id, "activation_in_progress")
    }
    let usageCount = 0
    if (deal.usage_limit_count != null && usageKey) {
      const usage = await consumeUsageLimit(options.db, {
        dealId: deal.id,
        userId: options.userId,
        scopeKey,
        bucketKey: usageKey,
        limitCount: deal.usage_limit_count,
      })
      if (!usage.allowed) {
        await options.db.query(
          "UPDATE deal_activations SET outcome='denied',location_decision='limit_reached',usage_bucket=$1 WHERE id=$2",
          [usageKey, id],
        )
        return denied(id, "limit_reached")
      }
      usageCount = usage.usageCount
    }
    const expiresAt = new Date(
      Math.min(
        now.getTime() + deal.display_ttl_seconds * 1000,
        asDate(deal.ends_at)?.getTime() ?? Number.POSITIVE_INFINITY,
      ),
    )
    await options.db.query(
      "UPDATE deal_activations SET outcome='successful',usage_bucket=$1,usage_counted=$2,redemption_payload_encrypted=$3,payload_expires_at=$4 WHERE id=$5",
      [
        usageKey,
        deal.usage_limit_count != null,
        deal.redemption_payload_encrypted,
        expiresAt,
        id,
      ],
    )
    const row = (
      await options.db.query<StoredActivation>(
        "SELECT id,outcome,activation_type,business_id,business_location_id,location_decision,distance_m,reported_accuracy_m,redemption_payload_encrypted,payload_expires_at,usage_bucket,usage_counted,created_at FROM deal_activations WHERE id=$1",
        [id],
      )
    ).rows[0]!
    return { ...successful(row, options, deal), usageCount }
  }

  const request = options.request
  const latitude = request.latitude
  const longitude = request.longitude
  const accuracyM = request.accuracyM
  const observedAt = request.observedAt
  if (
    latitude == null ||
    longitude == null ||
    accuracyM == null ||
    !observedAt
  ) {
    return insertDenied({ ...options, now }, {
      id,
      userId: options.userId,
      deal,
      locationId: location!.id,
      decision: "unavailable",
      distanceM: null,
      accuracyM: request.accuracyM ?? null,
      observedAt: null,
      idempotencyKey: key,
      latitude: request.latitude,
      longitude: request.longitude,
      reason: "location_permission_required",
    })
  }
  const proximity: ProximityCheckResult = validateProximity({
    observation: { latitude, longitude, accuracyM, observedAt },
    target: { latitude: location!.latitude!, longitude: location!.longitude! },
    radiusM: location!.geofence_radius_m,
    now,
  })
  if (proximity.decision !== "inside") {
    return insertDenied({ ...options, now }, {
      id,
      userId: options.userId,
      deal,
      locationId: location!.id,
      decision: proximity.decision,
      distanceM: proximity.distanceM,
      accuracyM: proximity.accuracyM,
      observedAt: proximity.observedAt,
      idempotencyKey: key,
      latitude: request.latitude,
      longitude: request.longitude,
      reason: proximity.reason,
    })
  }

  const bucket = getUsageBucket({
    period: deal.usage_limit_period,
    at: now,
    timeZone: location!.timezone,
    promoStartsAt: deal.starts_at,
    promoEndsAt: deal.ends_at,
  })
  const usageKey =
    bucket.key ?? (deal.usage_limit_count == null ? null : "offer")
  const scopeKey = usageScopeKey(deal.usage_limit_scope, location!.id)
  const claim = await options.db.query<{ id: string }>(
    `INSERT INTO deal_activations(id,user_id,deal_id,business_id,business_location_id,activation_type,idempotency_key,outcome,location_decision,
    submitted_latitude_encrypted,submitted_longitude_encrypted,location_observed_at,reported_accuracy_m,distance_m)
    VALUES($1,$2,$3,$4,$5,'verified_on_site',$6,'pending','inside',$7,$8,$9,$10,$11) ON CONFLICT (user_id,deal_id,idempotency_key) DO NOTHING RETURNING id`,
    [
      id,
      options.userId,
      deal.id,
      deal.business_id,
      location!.id,
      key,
      options.encryptCoordinate ? options.encryptCoordinate(latitude) : null,
      options.encryptCoordinate ? options.encryptCoordinate(longitude) : null,
      proximity.observedAt,
      proximity.accuracyM,
      proximity.distanceM,
    ],
  )
  if (!claim.rowCount) {
    const retry = await findStoredActivation(
      options.db,
      options.userId,
      deal.id,
      key,
    )
    return retry
      ? storedResult(retry, options, deal, now)
      : denied(id, "activation_in_progress")
  }

  let usageCount = 0
  if (deal.usage_limit_count != null && usageKey) {
    const usage = await consumeUsageLimit(options.db, {
      dealId: deal.id,
      userId: options.userId,
      scopeKey,
      bucketKey: usageKey,
      limitCount: deal.usage_limit_count,
    })
    if (!usage.allowed) {
      await options.db.query(
        "UPDATE deal_activations SET outcome='denied',location_decision='limit_reached',usage_bucket=$1 WHERE id=$2",
        [usageKey, id],
      )
      return denied(id, "limit_reached")
    }
    usageCount = usage.usageCount
  }
  const expiresAt = new Date(
    Math.min(
      now.getTime() + deal.display_ttl_seconds * 1000,
      asDate(deal.ends_at)?.getTime() ?? Number.POSITIVE_INFINITY,
    ),
  )
  await options.db.query(
    "UPDATE deal_activations SET outcome='successful',usage_bucket=$1,usage_counted=$2,redemption_payload_encrypted=$3,payload_expires_at=$4 WHERE id=$5",
    [
      usageKey,
      deal.usage_limit_count != null,
      deal.redemption_payload_encrypted,
      expiresAt,
      id,
    ],
  )
  const row = (
    await options.db.query<StoredActivation>(
      "SELECT id,outcome,activation_type,business_id,business_location_id,location_decision,distance_m,reported_accuracy_m,redemption_payload_encrypted,payload_expires_at,usage_bucket,usage_counted,created_at FROM deal_activations WHERE id=$1",
      [id],
    )
  ).rows[0]!
  return { ...successful(row, options, deal), usageCount }
}
