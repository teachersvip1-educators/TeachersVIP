import { describe, expect, it, vi } from "vitest"
import { activateDeal } from "./activation.js"
import type { Queryable } from "./usage.js"

const now = new Date("2026-10-21T12:00:00Z")
const target = { latitude: 29.934147087549, longitude: -95.248639723487 }
const deal = { id: "humble-offer", business_id: "humble", channel: "in_person", redemption_method: "coupon_code", redemption_payload_encrypted: "encrypted-secret", display_ttl_seconds: 300, usage_limit_count: null, usage_limit_period: "none", usage_limit_scope: "offer", tracking_mode: "standard_geolocation", starts_at: null, ends_at: null }
const location = { id: "humble:primary", business_id: "humble", timezone: "America/Chicago", ...target, geofence_radius_m: 150, active: true }

function database(selectedLocation = location) {
  // Database boundaries are stubbed; the real activation service and shared
  // proximity validation run for every case, including redemption protection.
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [deal] })
    .mockResolvedValueOnce({ rows: [selectedLocation] })
  return { query, db: { query } as unknown as Queryable }
}

describe("on-site activation enforcement", () => {
  it.each([
    ["low_accuracy", { accuracyM: 800 }],
    ["outside_radius", { latitude: target.latitude + 0.01 }],
    ["stale_location", { observedAt: "2026-10-21T11:55:00Z" }],
    ["invalid_location", { observedAt: "2026-10-21T12:05:00Z" }],
    ["invalid_location", { latitude: 95 }],
    ["invalid_location", { accuracyM: 0 }],
    ["stale_location", { observedAt: "2026-10-21T11:59:15Z" }],
  ])("denies %s before claiming usage or decrypting the offer", async (reason, override) => {
    const { db, query } = database(), decryptPayload = vi.fn()
    const result = await activateDeal({ db, userId: "member", dealId: deal.id, now, decryptPayload,
      request: { locationId: location.id, ...target, accuracyM: 5, observedAt: now.toISOString(), idempotencyKey: "request-1", ...override },
    })
    expect(result).toMatchObject({ ok: false, reason })
    expect(decryptPayload).not.toHaveBeenCalled()
    expect(query.mock.calls.some(([sql]) => sql.includes("'pending','inside'"))).toBe(false)
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO deal_usage"))).toBe(false)
    expect(result).not.toHaveProperty("redemptionPayload")
  })

  it("requires a participating location belonging to this offer", async () => {
    const { db, query } = database()
    query.mockReset().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [deal] }).mockResolvedValueOnce({ rows: [] })
    const result = await activateDeal({ db, userId: "member", dealId: deal.id, now,
      request: { locationId: "other:location", ...target, accuracyM: 5, observedAt: now.toISOString(), idempotencyKey: "request-1" },
    })
    expect(result).toMatchObject({ ok: false, reason: "deal_unavailable" })
    expect(query.mock.calls[2][0]).toContain("dl.deal_id=$1 AND dl.business_location_id=$2 AND bl.business_id=$3")
  })

  it("unlocks redemption only after a precise on-site fix passes server verification", async () => {
    const { db, query } = database(), decryptPayload = vi.fn(() => "VERIFIED-OFFER")
    query.mockResolvedValueOnce({ rows: [{ id: "activation-1" }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "activation-1", outcome: "successful", activation_type: "verified_on_site", business_id: deal.business_id, business_location_id: location.id, location_decision: "inside", distance_m: 0, reported_accuracy_m: 8, redemption_payload_encrypted: "encrypted-secret", payload_expires_at: new Date(now.getTime() + 300_000), usage_bucket: null, usage_counted: false, created_at: now }] })
    const result = await activateDeal({ db, userId: "member", dealId: deal.id, now, decryptPayload,
      request: { locationId: location.id, ...target, accuracyM: 8, observedAt: now.toISOString(), idempotencyKey: "request-1" },
    })
    expect(result).toMatchObject({ ok: true, status: "Location Verified", redemptionPayload: "VERIFIED-OFFER", distanceM: 0, accuracyM: 8 })
    expect(decryptPayload).toHaveBeenCalledOnce()
  })
  it('refuses to re-disclose a stored activation after its offer or location is revoked', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'previous', outcome: 'successful', business_location_id: location.id }] }).mockResolvedValueOnce({ rows: [] })
    const decryptPayload = vi.fn()
    const result = await activateDeal({ db: { query }, userId: 'member', dealId: deal.id, now, decryptPayload, request: { idempotencyKey: 'same-request' } })
    expect(result).toMatchObject({ ok: false, reason: 'deal_unavailable' })
    expect(decryptPayload).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(2)
  })
})
