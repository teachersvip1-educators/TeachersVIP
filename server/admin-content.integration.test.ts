import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { buildApp } from "./app"
import { getConfig } from "./config"
import { createPool } from "./db/pool"
import { tokenHash } from "./security"

const databaseUrl = process.env.TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip

suite("admin business creation and offer interest persistence", () => {
  const suffix = randomUUID().slice(0, 8)
  const businessId = `interest-business-${suffix}`
  const adminId = randomUUID(),
    memberId = randomUUID(),
    pendingId = randomUUID()
  const adminToken = randomUUID(),
    memberToken = randomUUID(),
    pendingToken = randomUUID()
  const config = getConfig({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl || "postgresql://test:test@localhost/test",
    APP_URL: "http://localhost:8443",
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    DATA_ENCRYPTION_KEY: "1".repeat(64),
  })
  const db = createPool(config)
  const app = buildApp({ config, db })
  const send = (
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: object,
    token = adminToken,
  ) =>
    app.inject({
      method,
      url,
      headers: { cookie: `teachersvip_session=${token}` },
      ...(payload ? { payload } : {}),
    })
  beforeAll(async () => {
    await app.ready()
    for (const [id, token, admin, verified] of [
      [adminId, adminToken, true, true],
      [memberId, memberToken, false, true],
      [pendingId, pendingToken, false, false],
    ] as const) {
      await db.query(
        `INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,is_superadmin,educator_verified_at) VALUES($1,$2,'test-only','=Test','Educator','Houston',$3,$4)`,
        [id, `${id}@example.test`, admin, verified ? new Date() : null],
      )
      await db.query(
        `INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')`,
        [randomUUID(), id, tokenHash(token)],
      )
      if (verified)
        await db.query(
          `INSERT INTO member_cards(id,user_id,member_id) VALUES($1,$2,$3)`,
          [randomUUID(), id, `VIP-${id}`],
        )
    }
  })
  afterAll(async () => {
    await db.query("DELETE FROM admin_audit_log WHERE user_id=$1", [adminId])
    await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
      [adminId, memberId, pendingId],
    ])
    await db.query("DELETE FROM deals WHERE business_id=$1", [businessId])
    await db.query("DELETE FROM businesses WHERE id=$1", [businessId])
    await app.close()
    await db.end()
  })

  it("creates a business without coordinates and explains duplicate slugs", async () => {
    const payload = {
      id: businessId,
      name: "Interest Test Cafe",
      category: "Dining",
      description: "A test cafe for educators.",
      imageUrl: "/teachersvip-logo.png",
    }
    expect(
      (await send("POST", "/api/admin/businesses", payload)).statusCode,
    ).toBe(200)
    const duplicate = await send("POST", "/api/admin/businesses", payload)
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().field).toBe("id")
  })
  it("persists all three interest CTAs without activation writes and exports member identities", async () => {
    for (const ctaType of ["join_waitlist", "rsvp", "get_launch_invite"]) {
      const id = `${ctaType.replaceAll("_", "-")}-${suffix}`
      const created = await send("POST", "/api/admin/deals", {
        id,
        businessId,
        ctaType,
        eventName: `Event ${ctaType}`,
        title: "Educator event",
        description: "An event for the educator community.",
        restrictions: "Verified educators only",
        channel: "in_person",
        category: "Dining",
        estimatedSavingsCents: 0,
      })
      expect(created.statusCode).toBe(200)
      expect(
        (await send("POST", `/api/deals/${id}/interest`, {}, pendingToken))
          .statusCode,
      ).toBe(403)
      const first = await send(
        "POST",
        `/api/deals/${id}/interest`,
        {},
        memberToken,
      )
      expect(first.statusCode).toBe(201)
      const repeat = await send(
        "POST",
        `/api/deals/${id}/interest`,
        {},
        memberToken,
      )
      expect(repeat.json()).toMatchObject({
        alreadySubmitted: true,
        submission: { id: first.json().submission.id },
      })
      expect(
        (
          await send(
            "POST",
            `/api/deals/${id}/activate`,
            { idempotencyKey: randomUUID() },
            memberToken,
          )
        ).statusCode,
      ).toBe(400)
      const list = await send("GET", `/api/admin/offer-interests?dealId=${id}`)
      expect(list.json().totals).toEqual({ submissions: 1, educators: 1 })
      expect(list.json().submissions[0]).toMatchObject({
        member_id: `VIP-${memberId}`,
        full_name: "=Test Educator",
        email: `${memberId}@example.test`,
        business_name: "Interest Test Cafe",
        event_name: `Event ${ctaType}`,
        submitted_at: expect.any(String),
      })
      const csv = await send(
        "GET",
        `/api/admin/offer-interests?dealId=${id}&export=csv`,
      )
      expect(csv.body).toContain("'=Test Educator")
      expect(
        (
          await send(
            "GET",
            `/api/admin/offer-interests?dealId=${id}&export=csv`,
            undefined,
            memberToken,
          )
        ).statusCode,
      ).toBe(403)
    }
    expect(
      (
        await db.query(
          "SELECT count(*)::int count FROM deal_activations WHERE business_id=$1",
          [businessId],
        )
      ).rows[0].count,
    ).toBe(0)
  })
  it("saves weekly hours and creates locations without requiring coordinates", async () => {
    expect(
      (
        await send("POST", `/api/admin/businesses/${businessId}/locations`, {
          name: "Downtown",
          address: "Houston",
          timezone: "America/Chicago",
        })
      ).statusCode,
    ).toBe(201)
    const locations = await send(
      "GET",
      `/api/admin/businesses/${businessId}/locations`,
    )
    expect(locations.json().locations).toContainEqual(
      expect.objectContaining({
        name: "Downtown",
        latitude: null,
        longitude: null,
      }),
    )
    expect(
      (
        await send("POST", `/api/admin/businesses/${businessId}/locations`, {
          name: "Other",
          latitude: 20,
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await send(
          "POST",
          `/api/admin/businesses/${businessId}/locations`,
          { name: "Other" },
          memberToken,
        )
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await send("PATCH", `/api/admin/businesses/${businessId}`, {
          openingHours: {},
          timezone: "America/Chicago",
          isOpen: true,
        })
      ).statusCode,
    ).toBe(200)
    const overview = await send("GET", "/api/admin/overview")
    expect(
      overview
        .json()
        .businesses.find((b: { id: string }) => b.id === businessId),
    ).toMatchObject({
      opening_hours: {},
      hours_timezone: "America/Chicago",
      is_open: false,
    })
    expect(
      (
        await send("PATCH", `/api/admin/businesses/${businessId}`, {
          openingHours: { mon: [{ open: "25:00", close: "17:00" }] },
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await send("PATCH", `/api/admin/businesses/${businessId}`, {
          openingHours: { mon: [{ open: "09:00", close: "09:00" }] },
        })
      ).statusCode,
    ).toBe(400)
    const payload = {
      id: `missing-geolocation-${suffix}`,
      businessId,
      title: "Onsite",
      description: "An in-person educator offer.",
      restrictions: "Verified educators only",
      channel: "in_person",
      category: "Dining",
      estimatedSavingsCents: 100,
    }
    expect((await send("POST", "/api/admin/deals", payload)).statusCode).toBe(
      400,
    )
    expect(
      (await db.query("SELECT id FROM deals WHERE id=$1", [payload.id])).rows,
    ).toHaveLength(0)
  })
  it("retains normal Use Deal activation and enforces its usage limit", async () => {
    const id = `use-deal-${suffix}`
    expect(
      (
        await send("POST", "/api/admin/deals", {
          id,
          businessId,
          title: "Online code",
          description: "A test online educator offer.",
          restrictions: "Verified educators only",
          channel: "online",
          category: "Dining",
          estimatedSavingsCents: 500,
          redemptionMethod: "coupon_code",
          redemptionValue: "TEST-CODE",
          trackingMode: "online",
        })
      ).statusCode,
    ).toBe(200)
    const result = await send(
      "POST",
      `/api/deals/${id}/activate`,
      { idempotencyKey: randomUUID() },
      memberToken,
    )
    expect(result.statusCode).toBe(200)
    expect(result.json().redemptionValue).toBe("TEST-CODE")
    expect(
      (
        await send(
          "POST",
          `/api/deals/${id}/activate`,
          { idempotencyKey: randomUUID() },
          memberToken,
        )
      ).statusCode,
    ).toBe(409)
  })
  it("edits an existing offer without replacing it and rejects invalid location changes", async () => {
    const id = `use-deal-${suffix}`
    expect((await send("GET", `/api/admin/deals/${id}`, undefined, memberToken)).statusCode).toBe(403)
    const changed = await send("PATCH", `/api/admin/deals/${id}`, {
      title: "Updated educator offer", eventName: "Educator evening",
      redemptionValue: "EDITED-CODE", promoCode: "EDITED-ONLINE",
      ctaType: "use_deal", channel: "online", locationIds: [],
    })
    expect(changed.statusCode).toBe(200)
    const read = await send("GET", `/api/admin/deals/${id}`)
    expect(read.json().deal).toMatchObject({ id, title: "Updated educator offer", event_name: "Educator evening", redemptionValue: "EDITED-CODE", promoCode: "EDITED-ONLINE" })
    expect(read.json().deal).not.toHaveProperty("redemption_payload_encrypted")
    const invalid = await send("PATCH", `/api/admin/deals/${id}`, { title: "Must roll back", channel: "in_person", locationIds: [] })
    expect(invalid.statusCode).toBe(400)
    expect((await send("GET", `/api/admin/deals/${id}`)).json().deal.title).toBe("Updated educator offer")
  })

})
