import { createHash, randomUUID } from "node:crypto"
import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import type { CateringRequest } from "../shared/catering.js"
import { DEFAULT_DISCOVER_MARKET, DISCOVER_MARKETS, LEGACY_DISCOVER_MARKET } from "../shared/discover-markets.js"
import type { DbPool } from "./db/pool.js"

type Authorize = (request: FastifyRequest) => { id: string }
export type CateringNotification = CateringRequest & { quote_email: string }
type SendNotification = (request: CateringNotification) => Promise<boolean>
const marketSchema = z.enum([...DISCOVER_MARKETS.map(m => m.id), LEGACY_DISCOVER_MARKET.id])
const businessParams = z.object({ businessId: z.string().min(1).max(160) })
const optionalText = (max: number) => z.string().trim().max(max).default("")
const profileSchema = z.object({
  market: marketSchema,
  serviceArea: z.string().trim().min(2).max(500),
  perk: z.string().trim().min(2).max(1000),
  minimumGuests: z.number().int().min(1).max(100000).nullable().default(null),
  leadTime: optionalText(300),
  deliveryOptions: optionalText(500),
  quoteEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  published: z.boolean().default(false),
}).refine(body => !body.published || Boolean(body.quoteEmail), { message: "Add the business's catering email before publishing.", path: ["quoteEmail"] })
const requestSchema = z.object({
  requestKey: z.uuid(),
  schoolName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(200),
  contactEmail: z.email().max(254),
  contactPhone: optionalText(60),
  eventType: z.enum(["Staff meal", "Meeting", "School event", "Other"]),
  eventDate: z.iso.date(),
  eventTime: optionalText(100),
  guestCount: z.number().int().min(1).max(100000),
  budget: optionalText(200),
  deliveryAddress: z.string().trim().min(2).max(1000),
  dietaryRequirements: optionalText(2000),
  notes: optionalText(4000),
  consent: z.literal(true),
})
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw Object.assign(new Error(issue?.message || "Invalid request."), { statusCode: 400, field: issue?.path[0] })
  }
  return result.data
}
const fields = `c.business_id,b.name,b.description,b.image_url,b.website_url,c.market_id,c.service_area,c.perk,c.minimum_guests,c.lead_time,c.delivery_options`
const requestFields = `id,business_id,business_name,market_id,school_name,contact_name,contact_email,contact_phone,event_type,event_date::text,event_time,guest_count,budget,delivery_address,dietary_requirements,notes,status,notification_sent_at,created_at`
const fail = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode })

export function registerCateringRoutes(app: FastifyInstance, db: DbPool, requireVerified: Authorize, requireSuperadmin: Authorize, sendNotification: SendNotification) {
  async function notify(id: string) {
    const claimed = await db.query<CateringNotification>(
      `UPDATE catering_requests SET notification_claimed_at=now()
       WHERE id=$1 AND notification_sent_at IS NULL
         AND (notification_claimed_at IS NULL OR notification_claimed_at < now()-interval '5 minutes')
       RETURNING ${requestFields},quote_email`, [id],
    )
    if (!claimed.rows[0]) {
      const existing = await db.query("SELECT notification_sent_at FROM catering_requests WHERE id=$1", [id])
      return Boolean(existing.rows[0]?.notification_sent_at)
    }
    let sent = false
    try { sent = await sendNotification(claimed.rows[0]) }
    catch (error) { app.log.error({ error, requestId: id }, "Catering notification failed; request is saved for admin follow-up") }
    await db.query(`UPDATE catering_requests SET notification_sent_at=CASE WHEN $2 THEN now() ELSE notification_sent_at END,
      notification_claimed_at=NULL WHERE id=$1`, [id, sent])
    return sent
  }

  app.get("/api/catering", async (request, reply) => {
    const { market } = parse(z.object({ market: marketSchema.default(DEFAULT_DISCOVER_MARKET.id) }), request.query)
    const result = await db.query(`SELECT ${fields} FROM catering_profiles c JOIN businesses b ON b.id=c.business_id
      WHERE c.published AND b.published AND c.market_id=$1 ORDER BY b.name,c.business_id`, [market])
    return reply.header("Cache-Control", "no-store").send({ listings: result.rows })
  })

  app.get("/api/admin/catering", async (request, reply) => {
    requireSuperadmin(request)
    const [businesses, listings] = await Promise.all([
      db.query("SELECT id,name,published FROM businesses ORDER BY name,id"),
      db.query(`SELECT ${fields},c.quote_email,c.published FROM catering_profiles c JOIN businesses b ON b.id=c.business_id ORDER BY b.name,c.business_id`),
    ])
    return reply.header("Cache-Control", "no-store").send({ businesses: businesses.rows, listings: listings.rows })
  })

  app.put("/api/admin/catering/:businessId", async (request) => {
    const admin = requireSuperadmin(request)
    const { businessId } = parse(businessParams, request.params)
    const body = parse(profileSchema, request.body)
    const business = await db.query("SELECT id FROM businesses WHERE id=$1", [businessId])
    if (!business.rows.length) throw fail("Business not found.", 404)
    await db.query(`INSERT INTO catering_profiles(business_id,market_id,service_area,perk,minimum_guests,lead_time,delivery_options,quote_email,published)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (business_id) DO UPDATE SET market_id=EXCLUDED.market_id,service_area=EXCLUDED.service_area,perk=EXCLUDED.perk,
        minimum_guests=EXCLUDED.minimum_guests,lead_time=EXCLUDED.lead_time,delivery_options=EXCLUDED.delivery_options,
        quote_email=EXCLUDED.quote_email,published=EXCLUDED.published,updated_at=now()`,
    [businessId,body.market,body.serviceArea,body.perk,body.minimumGuests,body.leadTime,body.deliveryOptions,body.quoteEmail,body.published])
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id) VALUES($1,$2,'updated','catering_profile',$3)`, [randomUUID(),admin.id,businessId])
    return { ok: true }
  })

  app.post("/api/catering/:businessId/requests", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const user = requireVerified(request)
    const { businessId } = parse(businessParams, request.params)
    const body = parse(requestSchema, request.body)
    const fingerprint = createHash("sha256").update(JSON.stringify({ ...body, requestKey: undefined })).digest("hex")
    const prior = await db.query("SELECT id,business_id,request_fingerprint,status FROM catering_requests WHERE user_id=$1 AND request_key=$2", [user.id,body.requestKey])
    let saved = prior.rows[0]
    if (!saved) {
      const profile = await db.query(`SELECT c.*,b.name FROM catering_profiles c JOIN businesses b ON b.id=c.business_id
        WHERE c.business_id=$1 AND c.published AND b.published`, [businessId])
      const listing = profile.rows[0]
      if (!listing) throw fail("This business is not currently accepting catering requests.", 404)
      if (listing.minimum_guests && body.guestCount < listing.minimum_guests)
        throw Object.assign(fail(`This business requires at least ${listing.minimum_guests} guests.`, 400), { field: "guestCount" })
      const timeZone = ["houston","dallas-fort-worth","new-orleans","nashville","chicago"].includes(listing.market_id)
        ? "America/Chicago" : listing.market_id === "phoenix" ? "America/Phoenix" : "America/New_York"
      const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
      if (body.eventDate < today) throw Object.assign(fail("Choose today or a future event date.", 400), { field: "eventDate" })
      const inserted = await db.query(`INSERT INTO catering_requests(id,business_id,user_id,request_key,request_fingerprint,business_name,market_id,quote_email,
        school_name,contact_name,contact_email,contact_phone,event_type,event_date,event_time,guest_count,budget,delivery_address,dietary_requirements,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT(user_id,request_key) DO NOTHING RETURNING id,business_id,request_fingerprint,status`,
      [randomUUID(),businessId,user.id,body.requestKey,fingerprint,listing.name,listing.market_id,listing.quote_email,
        body.schoolName,body.contactName,body.contactEmail,body.contactPhone,body.eventType,body.eventDate,body.eventTime,body.guestCount,body.budget,body.deliveryAddress,body.dietaryRequirements,body.notes])
      saved = inserted.rows[0]
      if (!saved) saved = (await db.query("SELECT id,business_id,request_fingerprint,status FROM catering_requests WHERE user_id=$1 AND request_key=$2", [user.id,body.requestKey])).rows[0]
    }
    if (!saved || saved.business_id !== businessId || saved.request_fingerprint !== fingerprint)
      throw fail("This request key was already used for another enquiry. Start a new request.", 409)
    const notificationSent = await notify(saved.id)
    return reply.code(prior.rows.length ? 200 : 201).send({ request: { id: saved.id, status: saved.status }, notificationSent })
  })

  app.get("/api/admin/catering-requests", async (request, reply) => {
    requireSuperadmin(request)
    const result = await db.query(`SELECT ${requestFields} FROM catering_requests ORDER BY created_at DESC,id LIMIT 200`)
    return reply.header("Cache-Control", "no-store").send({ requests: result.rows })
  })

  app.patch("/api/admin/catering-requests/:id", async (request) => {
    const admin = requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.uuid() }), request.params)
    const { status } = parse(z.object({ status: z.enum(["new","contacted","closed"]) }), request.body)
    const result = await db.query("UPDATE catering_requests SET status=$1,updated_at=now() WHERE id=$2 RETURNING id", [status,id])
    if (!result.rows.length) throw fail("Catering request not found.", 404)
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'updated','catering_request',$3,$4)`, [randomUUID(),admin.id,id,JSON.stringify({ status })])
    return { ok: true }
  })
}
