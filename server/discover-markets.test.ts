import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { buildApp } from "./app"
import { getConfig } from "./config"
import type { DbPool } from "./db/pool"
import { tokenHash } from "./security"

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn().mockResolvedValue({ data: { id: "test-email" }, error: null }),
}))
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail } } }))

const db = new PGlite({ extensions: { citext } })
const query = db.query.bind(db)
const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DbPool
const config = getConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost/test",
  SESSION_SECRET: "test-session-secret-that-is-long-enough",
  DATA_ENCRYPTION_KEY: "11".repeat(32),
  RESEND_API_KEY: "test",
  MARKETING_POSTAL_ADDRESS: "Test postal address",
})
const app = buildApp({ config, db: pool })
const adminId = randomUUID()
const educatorId = randomUUID()
const adminToken = randomUUID()
const educatorToken = randomUUID()
const request = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, token = educatorToken) =>
  app.inject({ method, url, payload, headers: { cookie: `teachersvip_session=${token}` } })

beforeAll(async () => {
  const migrations = new URL("./db/migrations/", import.meta.url)
  for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
    if (name === "029_discover_markets.sql") {
      await db.exec(`
        INSERT INTO businesses(id,name,category,description,image_url)
        VALUES ('market-test','Market Test Café','Dining','A test partner','/teachersvip-logo.png');
        INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,estimated_savings_cents,cta_type,event_name)
        VALUES ('houston-test-event','market-test','Houston event','Local educator event','in_person','Dining','Educators only',0,'rsvp','Houston event');
      `)
    }
    await db.exec(await readFile(new URL(name, migrations), "utf8"))
  }
  for (const [id, token, email, admin] of [
    [adminId, adminToken, "admin-market@example.test", true],
    [educatorId, educatorToken, "educator-market@example.test", false],
  ] as const) {
    await query(
      `INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,is_superadmin,educator_verified_at)
       VALUES($1,$2,'test-only','Test','Educator','Houston, Texas',$3,now())`,
      [id, email, admin],
    )
    await query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [randomUUID(), id, tokenHash(token)])
  }
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  await db.close()
})

describe("Discover market catalog and interest", () => {
  it("stores separate market waitlist opt-ins and scopes unsubscribe to one market", async () => {
    for (const market of ["atlanta", "washington-dc-maryland"]) {
      expect((await request("GET", `/api/me/city-alert?market=${market}`)).json()).toEqual({ alert: null })
      expect((await request("PUT", "/api/me/city-alert", { market, active: true })).statusCode).toBe(200)
    }
    expect((await request("GET", "/api/me/city-alert?market=washington-dc-maryland")).json())
      .toEqual({ alert: { city: "Washington, DC / Maryland", active: true } })
    const { rows: [dc] } = await db.query<{ unsubscribe_token: string }>(
      "SELECT unsubscribe_token FROM market_deal_alerts WHERE user_id=$1 AND market_id='washington-dc-maryland'", [educatorId],
    )
    expect((await app.inject({ method: "POST", url: "/api/city-alerts/unsubscribe", payload: { token: dc.unsubscribe_token } })).statusCode).toBe(200)
    expect((await request("GET", "/api/me/city-alert?market=washington-dc-maryland")).json().alert.active).toBe(false)
    expect((await request("GET", "/api/me/city-alert?market=atlanta")).json().alert.active).toBe(true)
  })

  it("shows events in their assigned markets and notifies only the matching waitlist", async () => {
    expect((await request("PUT", "/api/me/city-alert", { market: "atlanta", active: true })).statusCode).toBe(200)
    expect((await request("PUT", "/api/me/city-alert", { market: "houston", active: true }, adminToken)).statusCode).toBe(200)
    expect((await request("GET", "/api/deals?market=houston")).json().deals)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "houston-test-event", cta_type: "rsvp" })]))
    expect((await request("GET", "/api/deals?market=atlanta")).json().deals).toEqual([])
    expect((await request("GET", "/api/deals?market=unknown")).statusCode).toBe(400)

    const created = await request("POST", "/api/admin/deals", {
      id: "atlanta-test-event", businessId: "market-test", market: "atlanta",
      title: "Atlanta educator event", ctaType: "rsvp", channel: "in_person", category: "Dining",
      description: "An event for educators.", restrictions: "Educators only", estimatedSavingsCents: 0,
    }, adminToken)
    expect(created.statusCode, created.body).toBe(200)
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: "educator-market@example.test", subject: expect.stringContaining("Atlanta, GA") }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining("atlanta-test-event") }),
    )
    const atlantaOffer = expect.objectContaining({ id: "atlanta-test-event", cta_type: "rsvp" })
    expect((await request("GET", "/api/deals?market=atlanta")).json().deals).toEqual([atlantaOffer])
    expect((await request("GET", "/api/deals?market=houston")).json().deals).not.toContainEqual(atlantaOffer)
    expect((await request("GET", "/api/deals")).json().deals).toContainEqual(atlantaOffer)

    const moved = await request("PATCH", "/api/admin/deals/atlanta-test-event", { market: "miami" }, adminToken)
    expect(moved.statusCode, moved.body).toBe(200)
    expect((await request("GET", "/api/deals?market=atlanta")).json().deals).toEqual([])
    expect((await request("GET", "/api/deals?market=miami")).json().deals).toEqual([atlantaOffer])
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it("records a business suggestion against the selected metro label", async () => {
    const suggested = await request("POST", "/api/business-suggestions", {
      businessName: "Local Bookshop", market: "dallas-fort-worth",
    })
    expect(suggested.statusCode, suggested.body).toBe(201)
    const { rows } = await query("SELECT business_name,city FROM business_suggestions WHERE id=$1", [suggested.json().id])
    expect(rows).toEqual([{ business_name: "Local Bookshop", city: "Dallas–Fort Worth, TX" }])
  })
})
