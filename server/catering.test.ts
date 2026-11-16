import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { citext } from "@electric-sql/pglite/contrib/citext"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { buildApp } from "./app"
import { getConfig } from "./config"
import type { DbPool } from "./db/pool"
import { tokenHash } from "./security"

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue({ data: { id: "test" }, error: null }) }))
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail } } }))
const db = new PGlite({ extensions: { citext } })
const query = db.query.bind(db)
const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DbPool
const app = buildApp({ db: pool, config: getConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://test:test@localhost/test",
  SESSION_SECRET: "catering-test-secret-long-enough-123", DATA_ENCRYPTION_KEY: "11".repeat(32), RESEND_API_KEY: "test" }) })
const tokens = { admin: randomUUID(), educator: randomUUID(), unverified: randomUUID(), demo: randomUUID() }
let remote = 1
const request = (method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, role?: keyof typeof tokens) =>
  app.inject({ method, url, payload, remoteAddress: `127.0.0.${remote++}`, headers: role ? { cookie: `teachersvip_session=${tokens[role]}` } : {} })
const profile = { market: "houston", serviceArea: "Houston schools", perk: "Complimentary delivery for educator orders over $200",
  minimumGuests: 10, leadTime: "48 hours", deliveryOptions: "Delivery or pickup", quoteEmail: "quotes@example.test", published: true }
const enquiry = () => ({ requestKey: randomUUID(), schoolName: "Test School", contactName: "Test Educator", contactEmail: "educator@example.test",
  contactPhone: "555 0100", eventType: "Staff meal", eventDate: "2099-12-01", eventTime: "12:00", guestCount: 20,
  budget: "$15 per person", deliveryAddress: "100 School Road, Houston", dietaryRequirements: "Two vegetarian meals", notes: "Staff lunch", consent: true })

beforeAll(async () => {
  const migrations = new URL("./db/migrations/", import.meta.url)
  for (const name of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(name, migrations), "utf8"))
  for (const role of Object.keys(tokens) as (keyof typeof tokens)[]) {
    const id = randomUUID()
    await query(`INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,is_superadmin,is_demo,educator_verified_at)
      VALUES($1,$2,'test-only','Test','Educator','Houston, Texas',$3,$4,$5)`,
    [id,`${role}-catering@example.test`,role === "admin",role === "demo",role === "educator" || role === "admin" ? new Date() : null])
    await query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')", [randomUUID(),id,tokenHash(tokens[role])])
  }
  await query(`INSERT INTO businesses(id,name,category,description,image_url,published) VALUES
    ('caterer','Test Caterer','Dining','Meals for staff','/teachersvip-logo.png',true),
    ('hidden-caterer','Hidden Caterer','Dining','Hidden business','/teachersvip-logo.png',false)`)
  await app.ready()
}, 60000)
afterAll(async () => { await app.close(); await db.close() })

describe("Catering directory and enquiries", () => {
  it("limits profile management to admins and requires a recipient to publish", async () => {
    expect((await request("GET", "/api/admin/catering")).statusCode).toBe(401)
    expect((await request("PUT", "/api/admin/catering/caterer", profile, "educator")).statusCode).toBe(403)
    expect((await request("PUT", "/api/admin/catering/caterer", { ...profile, quoteEmail: "" }, "admin")).statusCode).toBe(400)
    const saved = await request("PUT", "/api/admin/catering/caterer", profile, "admin")
    expect(saved.statusCode, saved.body).toBe(200)
    expect((await query("SELECT category FROM businesses WHERE id='caterer'")).rows[0]).toEqual({ category: "Dining" })
  })

  it("scopes listings by city, hides unpublished businesses, and keeps quote emails private", async () => {
    await request("PUT", "/api/admin/catering/hidden-caterer", profile, "admin")
    const response = await request("GET", "/api/catering?market=houston")
    expect(response.headers["cache-control"]).toBe("no-store")
    expect(response.json().listings).toEqual([expect.objectContaining({ business_id: "caterer", minimum_guests: 10 })])
    expect(response.json().listings[0]).not.toHaveProperty("quote_email")
    expect((await request("GET", "/api/catering?market=atlanta")).json()).toEqual({ listings: [] })
    expect((await request("GET", "/api/catering?market=invalid")).statusCode).toBe(400)
    expect((await request("GET", "/api/admin/catering", undefined, "admin")).json().listings)
      .toContainEqual(expect.objectContaining({ business_id: "caterer", quote_email: profile.quoteEmail }))
  })

  it("requires verified membership and consent, with valid guest count/date and an available partner", async () => {
    for (const [role, code] of [[undefined,401],["unverified",403],["demo",403]] as const)
      expect((await request("POST", "/api/catering/caterer/requests", enquiry(), role)).statusCode).toBe(code)
    for (const changes of [{ consent: false }, { guestCount: 0 }, { guestCount: 5 }, { eventDate: "2020-01-01" }, { eventDate: "2099-02-30" }])
      expect((await request("POST", "/api/catering/caterer/requests", { ...enquiry(), ...changes }, "educator")).statusCode).toBe(400)
    expect((await request("POST", "/api/catering/hidden-caterer/requests", enquiry(), "educator")).statusCode).toBe(404)
    expect((await query("SELECT count(*)::int total FROM catering_requests")).rows[0].total).toBe(0)
  })

  it("saves a request, emails the business, and deduplicates retries without counting an order", async () => {
    const body = enquiry()
    sendEmail.mockClear()
    const created = await request("POST", "/api/catering/caterer/requests", body, "educator")
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json()).toMatchObject({ request: { id: expect.any(String), status: "new" }, notificationSent: true })
    expect(sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: profile.quoteEmail, replyTo: body.contactEmail, text: expect.stringContaining("Two vegetarian meals"),
    }), { idempotencyKey: `catering-request/${created.json().request.id}` })
    const retry = await request("POST", "/api/catering/caterer/requests", body, "educator")
    expect(retry.json()).toEqual(created.json())
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect((await request("POST", "/api/catering/caterer/requests", { ...body, guestCount: 30 }, "educator")).statusCode).toBe(409)
    expect((await query("SELECT count(*)::int total FROM catering_requests")).rows[0].total).toBe(1)
    expect((await query("SELECT count(*)::int total FROM deal_activations")).rows[0].total).toBe(0)
  })

  it("preserves requests on email failure, retries delivery, and exposes details only to admins", async () => {
    const body = enquiry()
    sendEmail.mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } })
    const saved = await request("POST", "/api/catering/caterer/requests", body, "educator")
    expect(saved.statusCode, saved.body).toBe(201)
    expect(saved.json().notificationSent).toBe(false)
    expect((await request("GET", "/api/admin/catering-requests", undefined, "educator")).statusCode).toBe(403)
    const list = await request("GET", "/api/admin/catering-requests", undefined, "admin")
    expect(list.json().requests).toContainEqual(expect.objectContaining({ id: saved.json().request.id, school_name: body.schoolName,
      event_date: body.eventDate, contact_email: body.contactEmail, notification_sent_at: null }))
    const retry = await request("POST", "/api/catering/caterer/requests", body, "educator")
    expect(retry.json().notificationSent).toBe(true)
    expect((await request("PATCH", `/api/admin/catering-requests/${saved.json().request.id}`, { status: "contacted" }, "admin")).statusCode).toBe(200)
    expect((await request("PATCH", `/api/admin/catering-requests/${saved.json().request.id}`, { status: "confirmed_order" }, "admin")).statusCode).toBe(400)
    expect((await query("SELECT count(*)::int total FROM catering_requests")).rows[0].total).toBe(2)
  })

  it("accepts separate events for the same school and rejects cross-origin submission", async () => {
    const body = enquiry()
    const rejected = await app.inject({ method: "POST", url: "/api/catering/caterer/requests", payload: body,
      headers: { cookie: `teachersvip_session=${tokens.educator}`, origin: "https://unrelated.example" } })
    expect(rejected.statusCode).toBe(403)
    const created = await request("POST", "/api/catering/caterer/requests", body, "educator")
    expect(created.statusCode, created.body).toBe(201)
    expect((await query("SELECT count(*)::int total FROM catering_requests")).rows[0].total).toBe(3)
    expect((await request("PUT", "/api/admin/catering/caterer", { ...profile, published: false }, "admin")).statusCode).toBe(200)
    expect((await request("GET", "/api/catering?market=houston")).json()).toEqual({ listings: [] })
    expect((await request("POST", "/api/catering/caterer/requests", enquiry(), "educator")).statusCode).toBe(404)
  })
})
