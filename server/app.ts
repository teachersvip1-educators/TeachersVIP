import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Fastify, { type FastifyRequest } from "fastify"
import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import fastifyStatic from "@fastify/static"
import { Resend } from "resend"
import { z } from "zod"
import type { Config } from "./config.js"
import type { DbPool } from "./db/pool.js"
import {
  decrypt,
  encrypt,
  hashPassword,
  randomToken,
  tokenHash,
  verifyPassword,
} from "./security.js"
import { createPass2UClient } from "./integrations/pass2u.js"
import { createCitySearch } from "./city-search.js"
import {
  decideVerification,
  decideVerificationForTestMode,
  domainLookupCandidates,
  normalizeEmail,
  type DomainEvidence,
  type EducatorRole,
} from "./verification/index.js"
import { activateDeal } from "./deals/activation.js"

const SESSION_COOKIE = "teachersvip_session"
const allowedAnalytics = new Set([
  "business_listing_view",
  "deal_view",
  "website_click",
  "directions_click",
])

type UserRow = {
  id: string
  personal_email: string
  first_name: string
  last_name: string
  mobile: string | null
  city: string
  sms_consent: boolean
  email_updates: boolean
  work_email: string | null
  educator_verified_at: string | null
  verification_status: string | null
  is_superadmin: boolean
}
type VerificationCaseRow = {
  id: string
  user_id: string
  work_email: string
  selected_role: EducatorRole
  normalized_domain: string
  status: string
}
type DomainRow = DomainEvidence & { id: string, institution_id: string | null }

declare module "fastify" {
  interface FastifyRequest {
    currentUser: UserRow | null
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = String(issue?.path[0] ?? "")
    const labels: Record<string, string> = {
      firstName: "First name",
      lastName: "Last name",
      personalEmail: "Educator work email",
      schoolEmail: "Educator work email",
      workEmail: "Educator work email",
      mobile: "Mobile number",
      city: "City",
      password: "Password",
      businessName: "Business name",
      businessEmail: "Business email",
      proposedDeal: "Proposed deal",
      email: "Email",
      role: "Educator role",
      roleAttestation: "Eligibility confirmation",
    }
    const label = labels[field] ?? "This field"
    let message = `${label} is invalid.`
    if (issue?.code === "too_small")
      message = `${label} must contain at least ${issue.minimum} characters.`
    else if (issue?.code === "too_big") message = `${label} is too long.`
    else if (issue?.code === "invalid_type") message = `${label} is required.`
    else if (issue?.code === "invalid_format" && issue.format === "email")
      message = `Enter a valid ${label.toLowerCase()}.`
    throw Object.assign(new Error(message), { statusCode: 400 })
  }
  return result.data
}

function verificationEmailHtml(verificationUrl: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">Verify your educator email to unlock TeachersVIP deals and your personalized VIP card.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border-radius:24px;background:#ffffff;box-shadow:0 18px 48px rgba(6,16,30,.16)"><tr><td align="center" style="padding:30px 24px 25px;background:#06101e;border-bottom:4px solid #d4af37"><img src="cid:teachersvip-logo" width="92" alt="TeachersVIP" style="display:block;width:92px;max-width:100%;height:auto;margin:0 auto 13px"><div style="font-size:25px;font-weight:800;letter-spacing:-.5px;color:#ffffff">Teachers<span style="color:#d4af37">VIP</span></div><div style="margin-top:7px;font-size:11px;font-weight:700;letter-spacing:1.6px;color:#f5d061;text-transform:uppercase">Exclusive educator perks</div></td></tr><tr><td style="padding:38px 34px 32px"><div style="font-size:12px;font-weight:800;letter-spacing:1.4px;color:#8a6d1a;text-transform:uppercase">One quick step</div><h1 style="margin:8px 0 14px;font-size:30px;line-height:1.15;color:#06101e">Verify your educator email</h1><p style="margin:0 0 24px;font-size:16px;line-height:1.65;color:#526174">Confirm this email address to continue to your personalized TeachersVIP card and educator-only offers.</p><table role="presentation" cellspacing="0" cellpadding="0" width="100%"><tr><td align="center" bgcolor="#d4af37" style="border-radius:999px"><a href="${verificationUrl}" style="display:block;padding:16px 24px;color:#06101e;font-size:16px;font-weight:800;text-decoration:none">Verify educator email</a></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border-radius:14px;background:#f8fafc"><tr><td style="padding:16px 18px;font-size:13px;line-height:1.55;color:#526174"><strong style="color:#06101e">This link expires in 30 minutes.</strong><br>Your school/work email is used for educator verification only.</td></tr></table><p style="margin:24px 0 7px;font-size:12px;line-height:1.5;color:#718096">If the button does not work, copy and paste this link into your browser:</p><p style="margin:0;word-break:break-all;font-size:11px;line-height:1.5;color:#8a6d1a"><a href="${verificationUrl}" style="color:#8a6d1a">${verificationUrl}</a></p></td></tr><tr><td align="center" style="padding:22px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#718096">If you did not request this email, you can safely ignore it.<br><strong style="color:#06101e">Free for educators. Always.</strong></td></tr></table></td></tr></table></body></html>`
}

function passwordResetEmailHtml(resetUrl: string) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;padding:28px"><h1>Reset your TeachersVIP password</h1><p>Use the secure link below to choose a new password. This link expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can safely ignore this email.</p></body></html>`
}

function newUserEmailHtml(user: {
  firstName: string
  lastName: string
  email: string
  city: string
}) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;padding:28px"><h1>New TeachersVIP member</h1><p>A new educator account has been registered.</p><p><strong>Name:</strong> ${user.firstName} ${user.lastName}<br><strong>Email:</strong> ${user.email}<br><strong>City:</strong> ${user.city}</p></body></html>`
}

export function buildApp({ config, db }: { config: Config, db: DbPool }) {
  const app = Fastify({
    bodyLimit: 4 * 1024 * 1024,
    logger: {
      redact: [
        "req.headers.cookie",
        "req.body.password",
        "req.body.pin",
        "req.body.promoCode",
        "req.body.imageUrl",
      ],
    },
    trustProxy: true,
  })
  const resend = config.RESEND_API_KEY
    ? new Resend(config.RESEND_API_KEY)
    : null
  const pass2u = createPass2UClient(config)
  const searchCities = createCitySearch(config)

  app.register(cookie, { secret: config.SESSION_SECRET })
  app.register(helmet, {
    contentSecurityPolicy:
      config.NODE_ENV === "production"
        ? {
            directives: {
              imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
            },
          }
        : false,
  })
  app.register(rateLimit, { max: 180, timeWindow: "1 minute" })

  app.decorateRequest("currentUser", null)
  app.addHook("onRequest", async (request) => {
    if (
      config.NODE_ENV !== "production" ||
      ["GET", "HEAD", "OPTIONS"].includes(request.method)
    )
      return
    const origin = request.headers.origin
    if (!origin) return
    const forwardedHost = String(
      request.headers["x-forwarded-host"] ?? request.headers.host ?? "",
    )
      .split(",")[0]!
      .trim()
    const forwardedProto = String(
      request.headers["x-forwarded-proto"] ?? request.protocol,
    )
      .split(",")[0]!
      .trim()
    const configuredOrigin = new URL(config.APP_URL).origin
    const requestOrigin = forwardedHost
      ? new URL(`${forwardedProto}://${forwardedHost}`).origin
      : null
    if (origin !== configuredOrigin && origin !== requestOrigin)
      throw Object.assign(new Error("Request origin is not allowed."), {
        statusCode: 403,
      })
  })
  app.addHook("preHandler", async (request) => {
    const raw = request.cookies[SESSION_COOKIE]
    if (!raw) return
    const result = await db.query<UserRow>(
      `SELECT u.id,u.personal_email,u.first_name,u.last_name,u.mobile,u.city,u.sms_consent,u.email_updates,u.work_email,u.educator_verified_at,u.is_superadmin,
      (SELECT c.status FROM educator_verification_cases c WHERE c.user_id=u.id ORDER BY c.created_at DESC LIMIT 1) verification_status
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [tokenHash(raw)],
    )
    request.currentUser = result.rows[0] ?? null
  })

  const requireUser = (request: FastifyRequest) => {
    if (!request.currentUser)
      throw Object.assign(new Error("Authentication required"), {
        statusCode: 401,
      })
    return request.currentUser
  }
  const requireVerified = (request: FastifyRequest) => {
    const user = requireUser(request)
    if (!user.educator_verified_at)
      throw Object.assign(new Error("Educator verification required"), {
        statusCode: 403,
      })
    return user
  }
  const configuredSuperadmins = config.SUPERADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  const isSuperadmin = (user: UserRow | null) =>
    Boolean(
      user &&
        (user.is_superadmin ||
          configuredSuperadmins.includes(user.personal_email.toLowerCase())),
    )
  const requireSuperadmin = (request: FastifyRequest) => {
    const user = requireUser(request)
    if (!isSuperadmin(user))
      throw Object.assign(new Error("Superadmin access required."), {
        statusCode: 403,
      })
    return user
  }

  async function createSession(reply: any, userId: string) {
    const token = randomToken()
    await db.query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",
      [randomUUID(), userId, tokenHash(token)],
    )
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
  }
  const publicOrigin = (request: FastifyRequest) => {
    const configured = new URL(config.APP_URL).origin
    if (config.NODE_ENV === "production" && configured.includes("localhost")) {
      const host = String(
        request.headers["x-forwarded-host"] ?? request.headers.host ?? "",
      )
        .split(",")[0]!
        .trim()
      const protocol = String(
        request.headers["x-forwarded-proto"] ?? request.protocol,
      )
        .split(",")[0]!
        .trim()
      if (host) return `${protocol}://${host}`
    }
    return configured
  }
  const sendEducatorVerification = async (
    request: FastifyRequest,
    userId: string,
    schoolEmail: string,
  ) => {
    const token = randomToken()
    const activeCase = await db.query<{ id: string }>(
      `SELECT id FROM educator_verification_cases WHERE user_id=$1 AND work_email=$2 AND status IN ('email_pending','manual_review') ORDER BY created_at DESC LIMIT 1`,
      [userId, schoolEmail],
    )
    if (!activeCase.rows[0])
      throw Object.assign(
        new Error(
          "Start a new educator verification request before sending a link.",
        ),
        { statusCode: 409 },
      )
    await db.query(
      `UPDATE educator_verification_cases SET email_link_token_hash=$1,email_link_expires_at=now()+interval '30 minutes',email_link_consumed_at=NULL,updated_at=now() WHERE id=$2`,
      [tokenHash(token), activeCase.rows[0].id],
    )
    await db.query(
      `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,previous_status,next_status) VALUES($1,$2,$3,'email_sent','email_pending','email_pending')`,
      [randomUUID(), activeCase.rows[0].id, userId],
    )
    const verificationUrl = `${publicOrigin(request)}/verify?token=${encodeURIComponent(token)}`
    if (resend) {
      const emailLogo = readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../public/teachersvip-logo.png",
        ),
      )
      const { error } = await resend.emails.send({
        from: config.RESEND_FROM_EMAIL,
        to: schoolEmail,
        subject: "Verify your TeachersVIP school email",
        html: verificationEmailHtml(verificationUrl),
        text: `Verify your school email\n\nConfirm your email to continue to your personalized TeachersVIP card and educator-only offers. This secure link expires in 30 minutes:\n\n${verificationUrl}\n\nIf you did not request this email, you can safely ignore it.\n\nFree for educators. Always.`,
        attachments: [
          {
            filename: "teachersvip-logo.png",
            content: emailLogo,
            contentType: "image/png",
            contentId: "teachersvip-logo",
          },
        ],
      })
      if (error) {
        app.log.error(
          { resendError: error },
          "Resend rejected the verification email",
        )
        throw Object.assign(
          new Error(
            "The verification email could not be sent. Please try again shortly.",
          ),
          { statusCode: 502 },
        )
      }
    } else
      app.log.warn(
        { verificationUrl },
        "Resend is not configured; returning a temporary verification URL for testing",
      )
    return verificationUrl
  }

  const findDomainEvidence = async (
    queryable: Pick<DbPool, "query">,
    email: string,
  ) => {
    const parsedEmail = normalizeEmail(email)
    if (!parsedEmail)
      return { parsedEmail: null, evidence: null as DomainRow | null }
    const candidates = domainLookupCandidates(parsedEmail)
    const result = await queryable.query<DomainRow>(
      `SELECT id,institution_id,
      normalized_domain AS "normalizedDomain",registrable_domain AS "registrableDomain",classification,decision,
      eligible_role AS "eligibleRole",evidence,evidence_url AS "evidenceUrl",reviewed_at AS "reviewedAt"
      FROM educator_domains WHERE normalized_domain=ANY($1::text[]) OR registrable_domain=$2
      ORDER BY (normalized_domain=$3) DESC,(decision='auto_eligible') DESC,reviewed_at DESC NULLS LAST LIMIT 1`,
      [candidates, parsedEmail.registrableDomain, parsedEmail.hostname],
    )
    return { parsedEmail, evidence: result.rows[0] ?? null }
  }

  const ensureMemberCard = async (
    queryable: Pick<DbPool, "query">,
    userId: string,
  ) => {
    await queryable.query(
      `INSERT INTO member_cards(id,user_id,member_id,status) VALUES($1,$2,$3,'active') ON CONFLICT (user_id) DO UPDATE SET status='active'`,
      [
        randomUUID(),
        userId,
        `TVIP-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      ],
    )
  }

  const issuePass2UForUser = async (userId: string, caseId?: string) => {
    if (!pass2u.ready)
      return { status: "not_configured" as const, downloadUrl: null }
    const client = await db.connect()
    try {
      await client.query("BEGIN")
      const identity = await client.query<{
        first_name: string
        last_name: string
        member_id: string
      }>(
        `SELECT u.first_name,u.last_name,m.member_id FROM users u JOIN member_cards m ON m.user_id=u.id WHERE u.id=$1 AND u.educator_verified_at IS NOT NULL`,
        [userId],
      )
      if (!identity.rows[0])
        throw Object.assign(new Error("Verified educator card not found."), {
          statusCode: 404,
        })
      await client.query(
        `INSERT INTO wallet_passes(id,user_id,provider,status) VALUES($1,$2,'pass2u','pending') ON CONFLICT (user_id,provider) DO NOTHING`,
        [randomUUID(), userId],
      )
      const existing = await client.query<{
        provider_pass_id: string | null
        status: string
      }>(
        `SELECT provider_pass_id,status FROM wallet_passes WHERE user_id=$1 AND provider='pass2u' FOR UPDATE`,
        [userId],
      )
      if (
        existing.rows[0]?.provider_pass_id &&
        existing.rows[0].status === "active"
      ) {
        await client.query("COMMIT")
        return {
          status: "active" as const,
          downloadUrl: `https://www.pass2u.net/d/${encodeURIComponent(existing.rows[0].provider_pass_id)}`,
        }
      }
      if (caseId)
        await client.query(
          `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,next_status) VALUES($1,$2,$3,'pass2u_pending','verified')`,
          [randomUUID(), caseId, userId],
        )
      try {
        const member = identity.rows[0]
        const created = await pass2u.createMembershipPass({
          teacherName: `${member.first_name} ${member.last_name}`,
          memberId: member.member_id,
        })
        await client.query(
          `UPDATE wallet_passes SET provider_pass_id=$1,status='active',last_error=NULL,updated_at=now() WHERE user_id=$2 AND provider='pass2u'`,
          [created.passId, userId],
        )
        if (caseId)
          await client.query(
            `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,next_status,metadata) VALUES($1,$2,$3,'pass2u_active','verified',$4)`,
            [
              randomUUID(),
              caseId,
              userId,
              JSON.stringify({ provider: "pass2u" }),
            ],
          )
        await client.query("COMMIT")
        return { status: "active" as const, downloadUrl: created.downloadUrl }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Pass2U request failed."
        await client.query(
          `UPDATE wallet_passes SET status='failed',last_error=$1,updated_at=now() WHERE user_id=$2 AND provider='pass2u'`,
          [message, userId],
        )
        if (caseId)
          await client.query(
            `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,next_status,notes) VALUES($1,$2,$3,'pass2u_failed','verified',$4)`,
            [randomUUID(), caseId, userId, message],
          )
        await client.query("COMMIT")
        throw error
      }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  app.get("/health/live", async () => ({ status: "ok" }))
  app.get("/health/ready", async (_request, reply) => {
    try {
      await db.query("SELECT 1")
      return { status: "ready" }
    } catch {
      return reply.code(503).send({ status: "not_ready" })
    }
  })

  app.get(
    "/api/cities",
    { config: { rateLimit: { max: 45, timeWindow: "1 minute" } } },
    async (request) => {
      const { q } = parse(
        z.object({ q: z.string().trim().min(1).max(100) }),
        request.query,
      )
      return { cities: await searchCities(q), manualEntryAllowed: true }
    },
  )

  app.post(
    "/api/newsletter",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const { email } = parse(
        z.object({ email: z.email().transform((value) => value.toLowerCase()) }),
        request.body,
      )
      await db.query(
        `INSERT INTO newsletter_subscriptions(email,subscribed,subscribed_at,unsubscribed_at,updated_at)
         VALUES($1,true,now(),null,now())
         ON CONFLICT (email) DO UPDATE SET subscribed=true,subscribed_at=now(),unsubscribed_at=null,updated_at=now()`,
        [email],
      )
      await db.query("UPDATE users SET email_updates=true,updated_at=now() WHERE personal_email=$1 OR work_email=$1", [email])
      return reply.code(201).send({ ok: true })
    },
  )

  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = parse(
        z.object({
          firstName: z.string().trim().min(2).max(80),
          lastName: z.string().trim().min(2).max(80),
          schoolEmail: z.email().transform((v) => v.toLowerCase()),
          mobile: z.string().trim().max(30).optional(),
          city: z.string().trim().min(2).max(100),
          password: z.string().min(8).max(128),
          smsConsent: z.boolean().default(false),
          role: z.enum(["K-12 educator", "College professor"]),
          roleAttestation: z.literal(true),
        }),
        request.body,
      )
      const id = randomUUID()
      const caseId = randomUUID()
      const normalized = normalizeEmail(body.schoolEmail)
      if (!normalized)
        throw Object.assign(new Error("Enter a valid educator work email."), {
          statusCode: 400,
        })
      const client = await db.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          `INSERT INTO users(id,personal_email,password_hash,first_name,last_name,mobile,city,sms_consent,sms_consent_version,sms_consented_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
            body.schoolEmail,
            await hashPassword(body.password),
            body.firstName,
            body.lastName,
            body.mobile || null,
            body.city,
            body.smsConsent,
            body.smsConsent ? "v1-2026-08" : null,
            body.smsConsent ? new Date() : null,
          ],
        )
        await client.query(
          `INSERT INTO educator_verification_cases(id,user_id,work_email,selected_role,normalized_domain,status) VALUES($1,$2,$3,$4,$5,'email_pending')`,
          [caseId, id, normalized.email, body.role, normalized.hostname],
        )
        await client.query(
          `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,next_status) VALUES($1,$2,$3,'created','email_pending')`,
          [randomUUID(), caseId, id],
        )
        await client.query("COMMIT")
      } catch (error: any) {
        await client.query("ROLLBACK")
        if (error.code === "23505")
          return reply
            .code(409)
            .send({
              error: "An account already exists for this educator work email.",
            })
        throw error
      } finally {
        client.release()
      }
      const verificationUrl = await sendEducatorVerification(
        request,
        id,
        body.schoolEmail,
      )
      if (resend && config.RESEND_TO_EMAIL) {
        const { error } = await resend.emails.send({
          from: config.RESEND_FROM_EMAIL,
          to: config.RESEND_TO_EMAIL,
          subject: "New TeachersVIP member registration",
          html: newUserEmailHtml({
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.schoolEmail,
            city: body.city,
          }),
          text: `New TeachersVIP member\n\nName: ${body.firstName} ${body.lastName}\nSchool email: ${body.schoolEmail}\nCity: ${body.city}`,
        })
        if (error)
          app.log.error(
            { resendError: error },
            "Resend rejected the new-user notification",
          )
      }
      await createSession(reply, id)
      return reply
        .code(201)
        .send({ ok: true, ...(!resend ? { verificationUrl } : {}) })
    },
  )

  app.post(
    "/api/auth/sign-in",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = parse(
        z.object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().min(1),
        }),
        request.body,
      )
      const result = await db.query<{ id: string, password_hash: string }>(
        "SELECT id,password_hash FROM users WHERE personal_email=$1",
        [body.email],
      )
      const user = result.rows[0]
      if (!user || !(await verifyPassword(body.password, user.password_hash)))
        return reply.code(401).send({ error: "Invalid email or password." })
      await createSession(reply, user.id)
      return { ok: true }
    },
  )

  app.post(
    "/api/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request) => {
      const { email } = parse(
        z.object({ email: z.email().transform((v) => v.toLowerCase()) }),
        request.body,
      )
      const result = await db.query<{ id: string, personal_email: string }>(
        "SELECT id,personal_email FROM users WHERE personal_email=$1",
        [email],
      )
      const user = result.rows[0]
      if (!user) return { ok: true }
      const token = randomToken()
      await db.query(
        "INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
        [randomUUID(), user.id, tokenHash(token)],
      )
      const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`
      if (resend) {
        const { error } = await resend.emails.send({
          from: config.RESEND_FROM_EMAIL,
          to: user.personal_email,
          subject: "Reset your TeachersVIP password",
          html: passwordResetEmailHtml(resetUrl),
          text: `Reset your TeachersVIP password\n\nThis secure link expires in 30 minutes:\n\n${resetUrl}`,
        })
        if (error)
          throw Object.assign(
            new Error(
              "The password reset email could not be sent. Please try again shortly.",
            ),
            { statusCode: 502 },
          )
      } else if (config.NODE_ENV === "development")
        app.log.info(
          { resetUrl },
          "Resend is not configured; development password reset URL",
        )
      return {
        ok: true,
        ...(config.NODE_ENV === "development" && !resend ? { resetUrl } : {}),
      }
    },
  )

  app.post("/api/auth/reset-password", async (request) => {
    const body = parse(
      z.object({
        token: z.string().min(20),
        password: z.string().min(8).max(128),
      }),
      request.body,
    )
    const client = await db.connect()
    try {
      await client.query("BEGIN")
      const result = await client.query<{ id: string, user_id: string }>(
        "SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
        [tokenHash(body.token)],
      )
      const reset = result.rows[0]
      if (!reset)
        throw Object.assign(
          new Error("This password reset link is invalid or expired."),
          { statusCode: 400 },
        )
      await client.query(
        "UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2",
        [await hashPassword(body.password), reset.user_id],
      )
      await client.query(
        "UPDATE password_resets SET consumed_at=now() WHERE id=$1",
        [reset.id],
      )
      await client.query(
        "UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",
        [reset.user_id],
      )
      await client.query("COMMIT")
      return { ok: true }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  })

  app.post("/api/auth/sign-out", async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE]
    if (raw)
      await db.query(
        "UPDATE sessions SET revoked_at=now() WHERE token_hash=$1",
        [tokenHash(raw)],
      )
    reply.clearCookie(SESSION_COOKIE, { path: "/" })
    return { ok: true }
  })

  app.get("/api/auth/session", async (request) => ({
    user: request.currentUser
      ? {
          ...request.currentUser,
          verified: Boolean(request.currentUser.educator_verified_at),
          is_superadmin: isSuperadmin(request.currentUser),
        }
      : null,
  }))

  app.get("/api/auth/admin-registration-status", async () => {
    const result = await db.query<{ available: boolean }>(
      `SELECT (completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE is_superadmin)) available FROM superadmin_bootstrap WHERE id=true`,
    )
    return { available: Boolean(result.rows[0]?.available) }
  })

  app.post(
    "/api/auth/admin-register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = parse(
        z.object({
          pin: z.string().regex(/^\d{4,12}$/),
          firstName: z.string().trim().min(2).max(80),
          lastName: z.string().trim().min(2).max(80),
          email: z.email().transform((value) => value.toLowerCase()),
          password: z.string().min(12).max(128),
          city: z.string().trim().min(2).max(100),
        }),
        request.body,
      )
      if (body.pin !== config.SUPERADMIN_REGISTRATION_PIN)
        return reply
          .code(403)
          .send({ error: "The registration PIN is incorrect." })
      const client = await db.connect()
      let userId: string = randomUUID()
      try {
        await client.query("BEGIN")
        const claim = await client.query<{ available: boolean }>(
          `SELECT (completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE is_superadmin)) available FROM superadmin_bootstrap WHERE id=true FOR UPDATE`,
        )
        if (!claim.rows[0]?.available) {
          await client.query("ROLLBACK")
          return reply
            .code(409)
            .send({
              error: "Superadmin registration has already been completed.",
            })
        }
        const existing = await client.query<{
          id: string
          password_hash: string
        }>(
          "SELECT id,password_hash FROM users WHERE personal_email=$1 FOR UPDATE",
          [body.email],
        )
        if (existing.rows[0]) {
          if (
            !(await verifyPassword(
              body.password,
              existing.rows[0].password_hash,
            ))
          ) {
            await client.query("ROLLBACK")
            return reply
              .code(401)
              .send({
                error:
                  "That email already has an account. Enter its current password to continue.",
              })
          }
          userId = existing.rows[0].id
          await client.query(
            "UPDATE users SET first_name=$1,last_name=$2,city=$3,educator_verified_at=COALESCE(educator_verified_at,now()),is_superadmin=true,updated_at=now() WHERE id=$4",
            [body.firstName, body.lastName, body.city, userId],
          )
        } else {
          await client.query(
            `INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,educator_verified_at,is_superadmin) VALUES($1,$2,$3,$4,$5,$6,now(),true)`,
            [
              userId,
              body.email,
              await hashPassword(body.password),
              body.firstName,
              body.lastName,
              body.city,
            ],
          )
        }
        await client.query(
          "INSERT INTO member_cards(id,user_id,member_id) VALUES($1,$2,$3)",
          [
            randomUUID(),
            userId,
            `TVIP-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          ],
        )
        await client.query(
          "UPDATE superadmin_bootstrap SET completed_at=now(),completed_by=$1 WHERE id=true",
          [userId],
        )
        await client.query("COMMIT")
      } catch (error: any) {
        await client.query("ROLLBACK")
        if (error.code === "23505")
          return reply
            .code(409)
            .send({ error: "An account already exists for this email." })
        throw error
      } finally {
        client.release()
      }
      await createSession(reply, userId)
      return reply.code(201).send({ ok: true })
    },
  )

  app.get("/api/admin/overview", async (request) => {
    const admin = requireSuperadmin(request)
    const optionalQuery = async <T,>(
      query: Promise<{ rows: T[] }>,
      fallback: { rows: T[] },
    ) => {
      try {
        return await query
      } catch (error) {
        app.log.warn({ error }, "Optional admin dashboard query failed")
        return fallback
      }
    }
    const [
      businesses,
      deals,
      members,
      uses,
      inquiries,
      audit,
      verificationQueue,
      activationMetrics,
    ] = await Promise.all([
      optionalQuery(
        db.query(`SELECT b.id,b.name,b.category,b.description,b.image_url,b.website_url,b.distance,b.hours,b.is_open,b.address,b.latitude,b.longitude,b.published,
        COALESCE((SELECT json_agg(json_build_object('id',l.id,'name',l.location_name,'address',l.address,'timezone',l.timezone,'radiusMeters',l.geofence_radius_m,'latitude',l.latitude,'longitude',l.longitude) ORDER BY l.created_at) FROM business_locations l WHERE l.business_id=b.id AND l.active),'[]'::json) locations
        FROM businesses b ORDER BY b.name`),
        { rows: [] } as { rows: unknown[] },
      ),
      optionalQuery(
        db.query(
          `SELECT d.id,d.business_id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,d.image_url,d.published,d.starts_at,d.ends_at,d.created_at,d.redemption_method,d.display_ttl_seconds,d.usage_limit_count,d.usage_limit_period,d.usage_limit_scope,d.tracking_mode,b.name business_name FROM deals d JOIN businesses b ON b.id=d.business_id ORDER BY d.created_at DESC`,
        ),
        { rows: [] } as { rows: unknown[] },
      ),
      optionalQuery(db.query(`SELECT COUNT(*)::int count FROM users`), {
        rows: [{ count: 0 }],
      } as { rows: { count: number }[] }),
      optionalQuery(
        db.query(
          `SELECT COUNT(*)::int count,COUNT(DISTINCT user_id)::int unique_educators,GREATEST(COUNT(*)-COUNT(DISTINCT user_id),0)::int repeat_usage FROM deal_activations WHERE outcome='successful' AND activation_type='verified_on_site'`,
        ),
        { rows: [{ count: 0, unique_educators: 0, repeat_usage: 0 }] } as {
          rows: {
            count: number
            unique_educators: number
            repeat_usage: number
          }[]
        },
      ),
      optionalQuery(
        db.query(`SELECT a.id,a.business_name,a.contact_name,a.contact_email business_email,a.proposed_offer proposed_deal,a.pos_system,a.redemption_method,a.display_ttl_seconds,a.usage_limit_count,a.usage_limit_period,a.usage_limit_scope,a.tracking_mode,a.status,a.created_at,
        COALESCE((SELECT json_agg(json_build_object('id',l.id,'name',l.location_name,'address',l.address,'timezone',l.timezone,'radiusMeters',l.geofence_radius_m,'latitude',l.latitude,'longitude',l.longitude) ORDER BY l.created_at) FROM business_application_locations l WHERE l.application_id=a.id),'[]'::json) locations
        FROM business_applications a ORDER BY a.created_at DESC LIMIT 50`),
        { rows: [] } as { rows: unknown[] },
      ),
      optionalQuery(
        db.query(
          `SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.first_name,u.last_name FROM admin_audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50`,
        ),
        { rows: [] } as { rows: unknown[] },
      ),
      optionalQuery(
        db.query(
          `SELECT c.id,c.work_email email,c.selected_role role,c.normalized_domain domain,c.status,array_to_string(c.reason_codes,', ') reason,d.classification,i.source_code source FROM educator_verification_cases c LEFT JOIN educator_domains d ON d.id=c.domain_id LEFT JOIN education_institutions i ON i.id=c.institution_id WHERE c.status IN ('email_pending','manual_review') ORDER BY c.created_at ASC`,
        ),
        { rows: [] } as { rows: unknown[] },
      ),
      optionalQuery(
        db.query(
          `SELECT b.name business_name,COALESCE(bl.location_name,bl.address,'Unknown location') location_name,COUNT(*)::int activations,COUNT(DISTINCT a.user_id)::int unique_educators,GREATEST(COUNT(*)-COUNT(DISTINCT a.user_id),0)::int repeat_usage FROM deal_activations a JOIN businesses b ON b.id=a.business_id LEFT JOIN business_locations bl ON bl.id=a.business_location_id WHERE a.outcome='successful' AND a.activation_type='verified_on_site' GROUP BY b.id,b.name,bl.id,bl.location_name,bl.address ORDER BY activations DESC,b.name`,
        ),
        { rows: [] } as { rows: unknown[] },
      ),
    ])
    return {
      businesses: businesses.rows,
      deals: deals.rows,
      inquiries: inquiries.rows,
      audit: audit.rows,
      verificationQueue: verificationQueue.rows,
      activationMetrics: activationMetrics.rows,
      metrics: {
        members: members.rows[0].count,
        uses: uses.rows[0].count,
        verifiedOnSiteActivations: uses.rows[0].count,
        uniqueEducators: uses.rows[0].unique_educators,
        repeatUsage: uses.rows[0].repeat_usage,
      },
      adminEmail: admin.personal_email,
    }
  })

  app.get("/api/admin/verifications", async (request) => {
    requireSuperadmin(request)
    const result =
      await db.query(`SELECT c.id,c.user_id,c.work_email,c.selected_role,c.status,c.reason_codes,c.review_notes,c.created_at,c.email_verified_at,
      c.normalized_domain,i.name institution_name,d.classification domain_classification,d.decision domain_decision,d.evidence,d.evidence_url,
      u.first_name,u.last_name,w.status wallet_status,w.last_error wallet_error
      FROM educator_verification_cases c JOIN users u ON u.id=c.user_id
      LEFT JOIN education_institutions i ON i.id=c.institution_id LEFT JOIN educator_domains d ON d.id=c.domain_id
      LEFT JOIN wallet_passes w ON w.user_id=c.user_id AND w.provider='pass2u'
      WHERE c.status IN ('email_pending','manual_review','rejected','suspended') ORDER BY CASE c.status WHEN 'manual_review' THEN 0 ELSE 1 END,c.created_at ASC`)
    return { cases: result.rows }
  })

  app.get("/api/admin/domains", async (request) => {
    requireSuperadmin(request)
    const result =
      await db.query(`SELECT d.id,d.normalized_domain,d.registrable_domain,d.classification,d.decision,d.eligible_role,d.evidence,d.evidence_url,d.reviewed_at,
      i.name institution_name,i.source_code,i.source_institution_id,i.website_url institution_website
      FROM educator_domains d LEFT JOIN education_institutions i ON i.id=d.institution_id
      ORDER BY CASE WHEN d.reviewed_at IS NULL THEN 0 ELSE 1 END,d.updated_at DESC LIMIT 250`)
    return { domains: result.rows }
  })

  app.patch("/api/admin/verifications/:id", async (request) => {
    const admin = requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params)
    const body = parse(
      z.object({
        action: z.enum(["approve", "reject", "request_information"]),
        notes: z.string().trim().min(2).max(2000),
      }),
      request.body,
    )
    const client = await db.connect()
    let userId = ""
    let nextStatus = "manual_review"
    try {
      await client.query("BEGIN")
      const selected = await client.query<{
        user_id: string
        work_email: string
        status: string
      }>(
        "SELECT user_id,work_email,status FROM educator_verification_cases WHERE id=$1 FOR UPDATE",
        [id],
      )
      const verificationCase = selected.rows[0]
      if (!verificationCase)
        throw Object.assign(new Error("Verification case not found."), {
          statusCode: 404,
        })
      if (!["email_pending", "manual_review"].includes(verificationCase.status))
        throw Object.assign(
          new Error("This verification case has already been decided."),
          { statusCode: 409 },
        )
      userId = verificationCase.user_id
      nextStatus =
        body.action === "approve"
          ? "verified"
          : body.action === "reject"
            ? "rejected"
            : "manual_review"
      await client.query(
        `UPDATE educator_verification_cases SET status=$1,review_notes=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now() WHERE id=$4`,
        [nextStatus, body.notes, admin.id, id],
      )
      if (body.action === "approve") {
        await client.query(
          "UPDATE users SET work_email=$1,educator_verified_at=now(),updated_at=now() WHERE id=$2",
          [verificationCase.work_email, userId],
        )
        await ensureMemberCard(client, userId)
      } else if (body.action === "reject") {
        await client.query(
          "UPDATE users SET educator_verified_at=NULL,updated_at=now() WHERE id=$1",
          [userId],
        )
        await client.query(
          `UPDATE member_cards SET status='suspended' WHERE user_id=$1`,
          [userId],
        )
      }
      const eventType =
        body.action === "approve"
          ? "approved"
          : body.action === "reject"
            ? "rejected"
            : "request_information"
      await client.query(
        `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,previous_status,next_status,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          id,
          admin.id,
          eventType,
          verificationCase.status,
          nextStatus,
          body.notes,
        ],
      )
      await client.query(
        `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'educator_verification',$4,$5)`,
        [
          randomUUID(),
          admin.id,
          body.action,
          id,
          JSON.stringify({ nextStatus, notes: body.notes }),
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    let walletStatus: string | null = null
    if (nextStatus === "verified") {
      try {
        walletStatus = (await issuePass2UForUser(userId, id)).status
      } catch (error) {
        app.log.error(
          { error, userId },
          "Pass2U issuance after manual approval failed",
        )
        walletStatus = "failed"
      }
    }
    return { ok: true, status: nextStatus, walletStatus }
  })

  app.patch("/api/admin/domains/:id", async (request) => {
    const admin = requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params)
    const body = parse(
      z
        .object({
          classification: z.enum([
            "staff_only",
            "shared_staff_student",
            "personal_provider",
            "unknown",
          ]),
          decision: z.enum(["auto_eligible", "manual_review", "blocked"]),
          eligibleRole: z
            .enum(["K-12 educator", "College professor", "both"])
            .nullable(),
          evidence: z.string().trim().max(2000).nullable(),
          evidenceUrl: z.url().nullable(),
        })
        .superRefine((value, context) => {
          if (
            value.decision === "auto_eligible" &&
            (value.classification !== "staff_only" ||
              !value.eligibleRole ||
              !value.evidence)
          )
            context.addIssue({
              code: "custom",
              message:
                "Automatic eligibility requires a staff-only classification, eligible role, and evidence.",
            })
        }),
      request.body,
    )
    const client = await db.connect()
    try {
      await client.query("BEGIN")
      const previous = await client.query<{
        classification: string
        decision: string
      }>(
        "SELECT classification,decision FROM educator_domains WHERE id=$1 FOR UPDATE",
        [id],
      )
      if (!previous.rows[0])
        throw Object.assign(new Error("Educator domain not found."), {
          statusCode: 404,
        })
      await client.query(
        `UPDATE educator_domains SET classification=$1,decision=$2,eligible_role=$3,evidence=$4,evidence_url=$5,reviewed_at=now(),reviewed_by=$6,updated_at=now() WHERE id=$7`,
        [
          body.classification,
          body.decision,
          body.eligibleRole,
          body.evidence,
          body.evidenceUrl,
          admin.id,
          id,
        ],
      )
      await client.query(
        `INSERT INTO educator_domain_reviews(id,domain_id,previous_classification,previous_decision,classification,decision,eligible_role,evidence,evidence_url,action,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reviewed',$10)`,
        [
          randomUUID(),
          id,
          previous.rows[0].classification,
          previous.rows[0].decision,
          body.classification,
          body.decision,
          body.eligibleRole,
          body.evidence,
          body.evidenceUrl,
          admin.id,
        ],
      )
      await client.query(
        `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'reviewed','educator_domain',$3,$4)`,
        [
          randomUUID(),
          admin.id,
          id,
          JSON.stringify({
            classification: body.classification,
            decision: body.decision,
            eligibleRole: body.eligibleRole,
          }),
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return { ok: true }
  })

  app.patch("/api/admin/business-applications/:id", async (request) => {
    const admin = requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params)
    const body = parse(
      z
        .object({
          action: z.enum(["under_review", "reject", "approve"]),
          notes: z.string().trim().min(2).max(2000),
          businessId: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]+$/)
            .max(80)
            .optional(),
          category: z.string().trim().min(2).max(60).optional(),
          description: z.string().trim().min(5).max(1000).optional(),
          imageUrl: z.string().trim().min(1).max(500).optional(),
          websiteUrl: z.url().nullable().optional(),
          dealId: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]+$/)
            .max(100)
            .optional(),
          dealTitle: z.string().trim().min(2).max(160).optional(),
          dealCategory: z.string().trim().min(2).max(60).optional(),
          restrictions: z.string().trim().min(2).max(1000).optional(),
          estimatedSavingsCents: z
            .number()
            .int()
            .min(0)
            .max(1000000)
            .optional(),
          startsAt: z.string().datetime().nullable().optional(),
          endsAt: z.string().datetime().nullable().optional(),
          publish: z.boolean().default(false),
          locations: z
            .array(
              z.object({
                applicationLocationId: z.string().uuid(),
                latitude: z.number().min(-90).max(90),
                longitude: z.number().min(-180).max(180),
                radiusMeters: z.number().int().min(25).max(5000),
              }),
            )
            .max(100)
            .optional(),
        })
        .superRefine((value, context) => {
          if (value.action !== "approve") return
          for (const field of [
            "businessId",
            "category",
            "description",
            "imageUrl",
            "dealId",
            "dealTitle",
            "dealCategory",
            "restrictions",
          ] as const)
            if (!value[field])
              context.addIssue({
                code: "custom",
                path: [field],
                message: `${field} is required for approval.`,
              })
          if (!value.locations?.length)
            context.addIssue({
              code: "custom",
              path: ["locations"],
              message:
                "Every participating location requires reviewed coordinates.",
            })
          if (
            value.startsAt &&
            value.endsAt &&
            new Date(value.endsAt) <= new Date(value.startsAt)
          )
            context.addIssue({
              code: "custom",
              path: ["endsAt"],
              message: "The offer end must be after its start.",
            })
        }),
      request.body,
    )
    const client = await db.connect()
    try {
      await client.query("BEGIN")
      const selected = await client.query<any>(
        "SELECT * FROM business_applications WHERE id=$1 FOR UPDATE",
        [id],
      )
      const application = selected.rows[0]
      if (!application)
        throw Object.assign(new Error("Business application not found."), {
          statusCode: 404,
        })
      if (["approved", "rejected"].includes(application.status))
        throw Object.assign(
          new Error("This business application has already been decided."),
          { statusCode: 409 },
        )
      if (body.action !== "approve") {
        const status = body.action === "reject" ? "rejected" : "under_review"
        await client.query(
          "UPDATE business_applications SET status=$1,review_notes=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$4",
          [status, body.notes, admin.id, id],
        )
        await client.query(
          `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,'business_application',$4,$5)`,
          [
            randomUUID(),
            admin.id,
            body.action,
            id,
            JSON.stringify({ notes: body.notes }),
          ],
        )
        await client.query("COMMIT")
        return { ok: true, status }
      }
      const applicationLocations = await client.query<any>(
        "SELECT * FROM business_application_locations WHERE application_id=$1 ORDER BY created_at",
        [id],
      )
      const coordinateMap = new Map(
        body.locations!.map((location) => [
          location.applicationLocationId,
          location,
        ]),
      )
      if (
        applicationLocations.rows.length !== coordinateMap.size ||
        applicationLocations.rows.some(
          (location) => !coordinateMap.has(location.id),
        )
      )
        throw Object.assign(
          new Error(
            "Reviewed coordinates are required for every submitted business location.",
          ),
          { statusCode: 400 },
        )
      if (
        application.usage_limit_period === "promo" &&
        (!body.startsAt || !body.endsAt)
      )
        throw Object.assign(
          new Error(
            "Promotional-period limits require offer start and end dates.",
          ),
          { statusCode: 400 },
        )
      if (!application.redemption_payload_encrypted)
        throw Object.assign(
          new Error(
            "A redemption value or cashier instruction is required before approval.",
          ),
          { statusCode: 400 },
        )
      const first = applicationLocations.rows[0]
      const firstCoordinates = coordinateMap.get(first.id)!
      await client.query(
        `INSERT INTO businesses(id,name,category,description,image_url,website_url,address,latitude,longitude,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          body.businessId,
          application.business_name,
          body.category,
          body.description,
          body.imageUrl,
          body.websiteUrl ?? null,
          first.address,
          firstCoordinates.latitude,
          firstCoordinates.longitude,
          body.publish,
        ],
      )
      const operationalLocationIds: string[] = []
      for (
        let index = 0;
        index < applicationLocations.rows.length;
        index += 1
      ) {
        const location = applicationLocations.rows[index]
        const coordinates = coordinateMap.get(location.id)!
        const locationId = `${body.businessId}-location-${index + 1}`
        operationalLocationIds.push(locationId)
        await client.query(
          `INSERT INTO business_locations(id,business_id,location_name,address,city,region,postal_code,country_code,timezone,latitude,longitude,geofence_radius_m,source_application_location_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            locationId,
            body.businessId,
            location.location_name,
            location.address,
            location.city,
            location.region,
            location.postal_code,
            location.country_code,
            location.timezone,
            coordinates.latitude,
            coordinates.longitude,
            coordinates.radiusMeters,
            location.id,
          ],
        )
      }
      await client.query(
        `INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,estimated_savings_cents,redemption_method,redemption_payload_encrypted,display_ttl_seconds,usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode,starts_at,ends_at,published) VALUES($1,$2,$3,$4,'in_person',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          body.dealId,
          body.businessId,
          body.dealTitle,
          application.proposed_offer,
          body.dealCategory,
          body.restrictions,
          body.estimatedSavingsCents ?? 0,
          application.redemption_method,
          application.redemption_payload_encrypted,
          application.display_ttl_seconds,
          application.usage_limit_count,
          application.usage_limit_period,
          application.usage_limit_scope,
          application.tracking_mode,
          body.startsAt ?? null,
          body.endsAt ?? null,
          body.publish,
        ],
      )
      for (const locationId of operationalLocationIds)
        await client.query(
          "INSERT INTO deal_locations(deal_id,business_location_id) VALUES($1,$2)",
          [body.dealId, locationId],
        )
      await client.query(
        `UPDATE business_applications SET status='approved',review_notes=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$3`,
        [body.notes, admin.id, id],
      )
      await client.query(
        `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'approved','business_application',$3,$4)`,
        [
          randomUUID(),
          admin.id,
          id,
          JSON.stringify({
            businessId: body.businessId,
            dealId: body.dealId,
            locations: operationalLocationIds.length,
            published: body.publish,
          }),
        ],
      )
      await client.query("COMMIT")
      return {
        ok: true,
        status: "approved",
        businessId: body.businessId,
        dealId: body.dealId,
      }
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  })

  app.post("/api/admin/businesses", async (request) => {
    requireSuperadmin(request)
    const body = parse(
      z
        .object({
          id: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]+$/)
            .max(80),
          name: z.string().trim().min(2).max(140),
          category: z.string().trim().min(2).max(60),
          description: z.string().trim().min(5).max(1000),
          imageUrl: z.string().trim().min(1).max(500),
          websiteUrl: z.url().nullable().optional(),
          distance: z.string().trim().max(120).nullable().optional(),
          hours: z.string().trim().max(120).nullable().optional(),
          isOpen: z.boolean().nullable().optional(),
          address: z.string().trim().max(200).nullable().optional(),
          latitude: z.number().min(-90).max(90).nullable().optional(),
          longitude: z.number().min(-180).max(180).nullable().optional(),
          locationName: z.string().trim().max(140).default("Primary location"),
          timezone: z.string().trim().min(3).max(80).default("UTC"),
          radiusMeters: z.number().int().min(25).max(5000).default(150),
        })
        .refine(
          (value) => (value.latitude == null) === (value.longitude == null),
          { message: "Latitude and longitude must be supplied together." },
        ),
      request.body,
    )
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }).format(
        new Date(),
      )
    } catch {
      throw Object.assign(new Error("Enter a valid IANA timezone."), {
        statusCode: 400,
      })
    }
    const client = await db.connect()
    let businessId = body.id
    try {
      await client.query("BEGIN")
      const result = await client.query(
        `INSERT INTO businesses(id,name,category,description,image_url,website_url,distance,hours,is_open,address,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          body.id,
          body.name,
          body.category,
          body.description,
          body.imageUrl,
          body.websiteUrl || null,
          body.distance || null,
          body.hours || null,
          body.isOpen ?? null,
          body.address || null,
          body.latitude ?? null,
          body.longitude ?? null,
        ],
      )
      businessId = result.rows[0].id
      if (body.address || body.latitude != null)
        await client.query(
          `INSERT INTO business_locations(id,business_id,location_name,address,timezone,latitude,longitude,geofence_radius_m) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            `${body.id}:primary`,
            body.id,
            body.locationName,
            body.address ?? null,
            body.timezone,
            body.latitude ?? null,
            body.longitude ?? null,
            body.radiusMeters,
          ],
        )
      await client.query(
        `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'created','business',$3,$4)`,
        [
          randomUUID(),
          request.currentUser!.id,
          businessId,
          JSON.stringify({ name: body.name }),
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return { ok: true }
  })

  app.patch("/api/admin/businesses/:id", async (request) => {
    requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().min(1) }), request.params)
    const body = parse(
      z
        .object({
          name: z.string().trim().min(2).max(140).optional(),
          category: z.string().trim().min(2).max(60).optional(),
          description: z.string().trim().min(5).max(1000).optional(),
          imageUrl: z.string().trim().min(1).max(500).optional(),
          websiteUrl: z.url().nullable().optional(),
          distance: z.string().trim().max(120).nullable().optional(),
          hours: z.string().trim().max(120).nullable().optional(),
          isOpen: z.boolean().nullable().optional(),
          address: z.string().trim().max(200).nullable().optional(),
          published: z.boolean().optional(),
        })
        .refine((value) => Object.keys(value).length > 0),
      request.body,
    )
    const mappings: Record<string, string> = {
      name: "name",
      category: "category",
      description: "description",
      imageUrl: "image_url",
      websiteUrl: "website_url",
      distance: "distance",
      hours: "hours",
      isOpen: "is_open",
      address: "address",
      published: "published",
    }
    const fields = Object.entries(body).filter(
      ([, value]) => value !== undefined,
    )
    await db.query(
      `UPDATE businesses SET ${fields.map(([field], index) => `${mappings[field]}=$${index + 1}`).join(",")} WHERE id=$${fields.length + 1}`,
      [...fields.map(([, value]) => value), id],
    )
    await db.query(
      `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'updated','business',$3,$4)`,
      [
        randomUUID(),
        request.currentUser!.id,
        id,
        JSON.stringify(Object.fromEntries(fields)),
      ],
    )
    return { ok: true }
  })

  app.post("/api/admin/deals", async (request) => {
    requireSuperadmin(request)
    const body = parse(
      z
        .object({
          id: z
            .string()
            .trim()
            .regex(/^[a-z0-9-]+$/)
            .max(100),
          businessId: z.string().trim().min(1).max(80),
          title: z.string().trim().min(2).max(160),
          description: z.string().trim().min(5).max(1000),
          channel: z.enum(["in_person", "online"]),
          category: z.string().trim().min(2).max(60),
          restrictions: z.string().trim().min(2).max(1000),
          promoCode: z.string().trim().max(200).optional(),
          redemptionMethod: z
            .enum([
              "pos_button",
              "coupon_code",
              "barcode",
              "cashier_instruction",
            ])
            .optional(),
          redemptionValue: z.string().trim().max(2000).nullable().optional(),
          displayTtlSeconds: z.number().int().min(30).max(3600).default(300),
          usageLimitCount: z
            .number()
            .int()
            .min(1)
            .max(1000)
            .nullable()
            .default(1),
          usageLimitPeriod: z
            .enum(["none", "day", "month", "promo", "lifetime"])
            .default("day"),
          usageLimitScope: z.enum(["offer", "location"]).default("offer"),
          trackingMode: z
            .enum(["standard_geolocation", "enhanced_pos", "online"])
            .optional(),
          locationIds: z.array(z.string().min(1).max(160)).max(100).default([]),
          imageUrl: z.string().trim().max(2500000).nullable().optional(),
          estimatedSavingsCents: z.number().int().min(0).max(1000000),
          featured: z.boolean().default(false),
          sponsored: z.boolean().default(false),
          giveaway: z.boolean().default(false),
          startsAt: z.string().datetime().nullable().optional(),
          endsAt: z.string().datetime().nullable().optional(),
        })
        .superRefine((value, context) => {
          if (
            value.usageLimitPeriod === "none" &&
            value.usageLimitCount !== null
          )
            context.addIssue({
              code: "custom",
              path: ["usageLimitCount"],
              message: "Unlimited offers must not include a usage count.",
            })
          if (
            value.usageLimitPeriod === "promo" &&
            (!value.startsAt || !value.endsAt)
          )
            context.addIssue({
              code: "custom",
              path: ["startsAt"],
              message: "Promotional limits require start and end dates.",
            })
          if (
            ["coupon_code", "barcode"].includes(value.redemptionMethod ?? "") &&
            !value.redemptionValue &&
            !value.promoCode
          )
            context.addIssue({
              code: "custom",
              path: ["redemptionValue"],
              message: "A coupon code or barcode value is required.",
            })
        }),
      request.body,
    )
    const method =
      body.redemptionMethod ??
      (body.channel === "online" ? "coupon_code" : "cashier_instruction")
    const redemptionValue =
      body.redemptionValue ||
      body.promoCode ||
      (method === "pos_button"
        ? "Tap the TeachersVIP discount button in the normal POS."
        : method === "cashier_instruction"
          ? "Apply the TeachersVIP educator offer in the normal POS."
          : null)
    const client = await db.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,promo_code_encrypted,estimated_savings_cents,featured,sponsored,giveaway,image_url,published,starts_at,ends_at,redemption_method,redemption_payload_encrypted,display_ttl_seconds,usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          body.id,
          body.businessId,
          body.title,
          body.description,
          body.channel,
          body.category,
          body.restrictions,
          body.promoCode
            ? encrypt(body.promoCode, config.DATA_ENCRYPTION_KEY)
            : null,
          body.estimatedSavingsCents,
          body.featured,
          body.sponsored,
          body.giveaway,
          body.imageUrl || null,
          body.startsAt || null,
          body.endsAt || null,
          method,
          redemptionValue
            ? encrypt(redemptionValue, config.DATA_ENCRYPTION_KEY)
            : null,
          body.displayTtlSeconds,
          body.usageLimitCount,
          body.usageLimitPeriod,
          body.usageLimitScope,
          body.trackingMode ??
            (body.channel === "online" ? "online" : "standard_geolocation"),
        ],
      )
      if (body.channel === "in_person") {
        const locations = body.locationIds.length
          ? await client.query<{ id: string }>(
              "SELECT id FROM business_locations WHERE business_id=$1 AND active AND id=ANY($2::text[])",
              [body.businessId, body.locationIds],
            )
          : await client.query<{ id: string }>(
              "SELECT id FROM business_locations WHERE business_id=$1 AND active ORDER BY created_at",
              [body.businessId],
            )
        if (
          !locations.rows.length ||
          (body.locationIds.length &&
            locations.rows.length !== new Set(body.locationIds).size)
        )
          throw Object.assign(
            new Error(
              "Select at least one valid participating location for this in-person deal.",
            ),
            { statusCode: 400 },
          )
        for (const location of locations.rows)
          await client.query(
            "INSERT INTO deal_locations(deal_id,business_location_id) VALUES($1,$2)",
            [body.id, location.id],
          )
      }
      await client.query(
        `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'created','deal',$3,$4)`,
        [
          randomUUID(),
          request.currentUser!.id,
          body.id,
          JSON.stringify({
            businessId: body.businessId,
            title: body.title,
            method,
            usageLimitPeriod: body.usageLimitPeriod,
          }),
        ],
      )
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    return { ok: true }
  })

  app.patch("/api/admin/deals/:id", async (request) => {
    requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().min(1) }), request.params)
    const body = parse(
      z
        .object({
          published: z.boolean().optional(),
          featured: z.boolean().optional(),
          sponsored: z.boolean().optional(),
          title: z.string().trim().min(2).max(160).optional(),
          description: z.string().trim().min(5).max(1000).optional(),
          restrictions: z.string().trim().min(2).max(1000).optional(),
          imageUrl: z.string().trim().max(2500000).nullable().optional(),
          estimatedSavingsCents: z
            .number()
            .int()
            .min(0)
            .max(1000000)
            .optional(),
          startsAt: z.string().datetime().nullable().optional(),
          endsAt: z.string().datetime().nullable().optional(),
          redemptionMethod: z
            .enum([
              "pos_button",
              "coupon_code",
              "barcode",
              "cashier_instruction",
            ])
            .optional(),
          redemptionValue: z.string().trim().max(2000).nullable().optional(),
          displayTtlSeconds: z.number().int().min(30).max(3600).optional(),
          usageLimitCount: z
            .number()
            .int()
            .min(1)
            .max(1000)
            .nullable()
            .optional(),
          usageLimitPeriod: z
            .enum(["none", "day", "month", "promo", "lifetime"])
            .optional(),
          usageLimitScope: z.enum(["offer", "location"]).optional(),
          trackingMode: z
            .enum(["standard_geolocation", "enhanced_pos", "online"])
            .optional(),
        })
        .refine((value) => Object.keys(value).length > 0),
      request.body,
    )
    const mappings: Record<string, string> = {
      published: "published",
      featured: "featured",
      sponsored: "sponsored",
      title: "title",
      description: "description",
      restrictions: "restrictions",
      imageUrl: "image_url",
      estimatedSavingsCents: "estimated_savings_cents",
      startsAt: "starts_at",
      endsAt: "ends_at",
      redemptionMethod: "redemption_method",
      redemptionValue: "redemption_payload_encrypted",
      displayTtlSeconds: "display_ttl_seconds",
      usageLimitCount: "usage_limit_count",
      usageLimitPeriod: "usage_limit_period",
      usageLimitScope: "usage_limit_scope",
      trackingMode: "tracking_mode",
    }
    const fields = Object.entries(body)
      .filter(([, value]) => value !== undefined)
      .map(
        ([field, value]) =>
          [
            field,
            field === "redemptionValue" && value
              ? encrypt(String(value), config.DATA_ENCRYPTION_KEY)
              : value,
          ] as const,
      )
    await db.query(
      `UPDATE deals SET ${fields.map(([field], index) => `${mappings[field]}=$${index + 1}`).join(",")} WHERE id=$${fields.length + 1}`,
      [...fields.map(([, value]) => value), id],
    )
    await db.query(
      `INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'updated','deal',$3,$4)`,
      [
        randomUUID(),
        request.currentUser!.id,
        id,
        JSON.stringify(Object.fromEntries(fields)),
      ],
    )
    return { ok: true }
  })

  app.post(
    "/api/verification/send",
    { config: { rateLimit: { max: 4, timeWindow: "15 minutes" } } },
    async (request) => {
      const user = requireUser(request)
      const verificationUrl = await sendEducatorVerification(
        request,
        user.id,
        user.personal_email,
      )
      return { ok: true, ...(!resend ? { verificationUrl } : {}) }
    },
  )

  app.post("/api/verification/confirm", async (request, reply) => {
    const { token } = parse(
      z.object({ token: z.string().min(20) }),
      request.body,
    )
    const client = await db.connect()
    let verifiedUserId = ""
    let verificationStatus: "verified" | "manual_review" = "manual_review"
    let verifiedCaseId = ""
    try {
      await client.query("BEGIN")
      const result = await client.query<VerificationCaseRow>(
        `SELECT id,user_id,work_email,selected_role,normalized_domain,status FROM educator_verification_cases WHERE email_link_token_hash=$1 AND email_link_consumed_at IS NULL AND email_link_expires_at>now() FOR UPDATE`,
        [tokenHash(token)],
      )
      const record = result.rows[0]
      if (!record)
        throw Object.assign(
          new Error("This verification link is invalid or expired."),
          { statusCode: 400 },
        )
      const { parsedEmail, evidence } = await findDomainEvidence(
        client,
        record.work_email,
      )
      const decision = config.VERIFICATION_TEST_MODE
        ? decideVerificationForTestMode(record.work_email)
        : decideVerification(record.work_email, record.selected_role, evidence)
      verificationStatus = decision.status
      verifiedCaseId = record.id
      await client.query(
        `UPDATE educator_verification_cases SET email_verified_at=now(),email_link_consumed_at=now(),email_link_token_hash=NULL,
        status=$1,reason_codes=$2,domain_id=$3,institution_id=$4,normalized_domain=$5,updated_at=now() WHERE id=$6`,
        [
          decision.status,
          decision.reasonCodes,
          evidence?.id ?? null,
          evidence?.institution_id ?? null,
          parsedEmail?.hostname ?? record.normalized_domain,
          record.id,
        ],
      )
      await client.query(
        `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,previous_status,next_status,reason_codes,metadata)
        VALUES($1,$2,$3,'email_verified',$4,$5,$6,$7)`,
        [
          randomUUID(),
          record.id,
          record.user_id,
          record.status,
          decision.status,
          decision.reasonCodes,
          JSON.stringify({
            automatic: decision.automatic,
            domain: decision.normalizedDomain,
            testMode: config.VERIFICATION_TEST_MODE,
          }),
        ],
      )
      await client.query(
        `INSERT INTO educator_verification_audits(id,case_id,actor_user_id,event_type,previous_status,next_status,reason_codes)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(),
          record.id,
          record.user_id,
          decision.automatic ? "auto_eligible" : "manual_review",
          record.status,
          decision.status,
          decision.reasonCodes,
        ],
      )
      await client.query(
        `UPDATE users SET work_email=$1,educator_verified_at=CASE WHEN $2='verified' THEN now() ELSE NULL END,updated_at=now() WHERE id=$3`,
        [record.work_email, decision.status, record.user_id],
      )
      if (decision.status === "verified")
        await ensureMemberCard(client, record.user_id)
      await client.query("COMMIT")
      verifiedUserId = record.user_id
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
    await createSession(reply, verifiedUserId)
    let walletStatus: "not_requested" | "not_configured" | "active" | "failed" =
      "not_requested"
    if (verificationStatus === "verified") {
      try {
        walletStatus = (
          await issuePass2UForUser(verifiedUserId, verifiedCaseId)
        ).status
      } catch (error) {
        app.log.error(
          { error, userId: verifiedUserId },
          "Automatic Pass2U issuance failed",
        )
        walletStatus = "failed"
      }
    }
    return {
      ok: true,
      status: verificationStatus,
      caseId: verifiedCaseId,
      walletStatus,
    }
  })

  app.get("/api/me", async (request) => {
    const user = requireUser(request)
    const result = await db.query(
      `SELECT u.id,u.personal_email,u.first_name,u.last_name,u.mobile,u.city,u.sms_consent,u.email_updates,u.work_email,u.educator_verified_at,m.member_id,
      COALESCE((SELECT sum(d.estimated_savings_cents) FROM deal_activations a JOIN deals d ON d.id=a.deal_id WHERE a.user_id=u.id AND a.outcome='successful'),0)::int estimated_savings_cents,
      COALESCE((SELECT count(*) FROM deal_activations a WHERE a.user_id=u.id AND a.outcome='successful'),0)::int reported_uses
      FROM users u JOIN member_cards m ON m.user_id=u.id WHERE u.id=$1`,
      [user.id],
    )
    return { profile: result.rows[0] }
  })

  app.patch("/api/me", async (request) => {
    const user = requireUser(request)
    const body = parse(
      z.object({
        firstName: z.string().trim().min(2).max(80),
        lastName: z.string().trim().min(2).max(80),
        mobile: z.string().trim().max(30).nullable(),
        city: z.string().trim().min(2).max(100),
        smsConsent: z.boolean(),
        emailUpdates: z.boolean(),
      }),
      request.body,
    )
    await db.query(
      `UPDATE users SET first_name=$1,last_name=$2,mobile=$3,city=$4,sms_consent=$5,email_updates=$6,
      sms_consent_version=CASE WHEN $5 THEN 'v1-2026-08' ELSE sms_consent_version END,
      sms_consented_at=CASE WHEN $5 AND NOT sms_consent THEN now() ELSE sms_consented_at END,updated_at=now() WHERE id=$7`,
      [
        body.firstName,
        body.lastName,
        body.mobile,
        body.city,
        body.smsConsent,
        body.emailUpdates,
        user.id,
      ],
    )
    return { ok: true }
  })

  app.post("/api/me/unsubscribe", async (request) => {
    const user = requireUser(request)
    await db.query("UPDATE users SET email_updates=false,sms_consent=false,updated_at=now() WHERE id=$1", [user.id])
    await db.query(
      `INSERT INTO newsletter_subscriptions(email,subscribed,unsubscribed_at,updated_at)
       VALUES($1,false,now(),now())
       ON CONFLICT (email) DO UPDATE SET subscribed=false,unsubscribed_at=now(),updated_at=now()`,
      [user.personal_email],
    )
    return { ok: true }
  })

  app.get("/api/me/vip-card", async (request) => {
    const user = requireVerified(request)
    const result = await db.query(
      "SELECT member_id,status,issued_at FROM member_cards WHERE user_id=$1",
      [user.id],
    )
    const wallet = await db.query<{
      status: string
      provider_pass_id: string | null
    }>(
      "SELECT status,provider_pass_id FROM wallet_passes WHERE user_id=$1 AND provider=$2",
      [user.id, "pass2u"],
    )
    return {
      card: {
        ...result.rows[0],
        teacherName: `${user.first_name} ${user.last_name}`,
        verified: true,
        walletStatus:
          wallet.rows[0]?.status ??
          (pass2u.ready ? "available" : "not_configured"),
        walletDownloadUrl: wallet.rows[0]?.provider_pass_id
          ? `https://www.pass2u.net/d/${encodeURIComponent(wallet.rows[0].provider_pass_id!)}`
          : null,
      },
    }
  })

  app.post(
    "/api/me/wallet-pass",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request) => {
      const user = requireVerified(request)
      if (!pass2u.ready)
        throw Object.assign(new Error("Pass2U automation is not configured."), {
          statusCode: 503,
        })
      return issuePass2UForUser(user.id)
    },
  )

  app.get("/api/deals", async (request) => {
    const query = parse(
      z.object({
        q: z.string().optional(),
        category: z.string().optional(),
        channel: z.enum(["in_person", "online"]).optional(),
        saved: z.coerce.boolean().optional(),
      }),
      request.query,
    )
    const userId = request.currentUser?.id ?? null
    const result = await db.query(
      `SELECT d.id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,d.starts_at,d.ends_at,d.usage_limit_count,d.usage_limit_period,d.redemption_method AS "redemptionMethod",
      b.id business_id,b.name business_name,b.description business_description,COALESCE(d.image_url,b.image_url) image_url,b.website_url,b.distance,b.hours,b.is_open,b.address,b.latitude,b.longitude,
      EXISTS(SELECT 1 FROM saved_deals s WHERE s.deal_id=d.id AND s.user_id=$1) saved,
      EXISTS(SELECT 1 FROM deal_activations a WHERE a.deal_id=d.id AND a.user_id=$1 AND a.outcome='successful') used
      FROM deals d JOIN businesses b ON b.id=d.business_id
      WHERE d.published AND b.published AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now()) AND ($2::text IS NULL OR d.category=$2) AND ($3::text IS NULL OR d.channel=$3)
      AND ($4::text IS NULL OR d.title ILIKE '%'||$4||'%' OR b.name ILIKE '%'||$4||'%')
      AND (NOT $5::boolean OR EXISTS(SELECT 1 FROM saved_deals s WHERE s.deal_id=d.id AND s.user_id=$1))
      ORDER BY d.featured DESC,d.sponsored DESC,b.name`,
      [
        userId,
        query.category ?? null,
        query.channel ?? null,
        query.q ?? null,
        query.saved ?? false,
      ],
    )
    return { deals: result.rows }
  })

  app.get("/api/deals/:id", async (request, reply) => {
    const { id } = parse(z.object({ id: z.string() }), request.params)
    const result = await db.query(
      `SELECT d.id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,d.starts_at,d.ends_at,d.usage_limit_count,d.usage_limit_period,d.redemption_method AS "redemptionMethod",
      b.id business_id,b.name business_name,b.description business_description,COALESCE(d.image_url,b.image_url) image_url,b.website_url,b.distance,b.hours,b.is_open,b.address,b.latitude,b.longitude,
      COALESCE((SELECT json_agg(json_build_object('id',bl.id,'name',bl.location_name,'address',COALESCE(bl.address,b.address),'latitude',bl.latitude,'longitude',bl.longitude,'radiusMeters',bl.geofence_radius_m,'timezone',bl.timezone) ORDER BY bl.location_name,bl.id)
        FROM deal_locations dl JOIN business_locations bl ON bl.id=dl.business_location_id WHERE dl.deal_id=d.id AND bl.active),'[]'::json) locations
      FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.published AND b.published AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())`,
      [id],
    )
    if (!result.rows[0])
      return reply.code(404).send({ error: "Deal not found." })
    return { deal: result.rows[0] }
  })

  app.post(
    "/api/deals/:id/activate",
    { config: { rateLimit: { max: 12, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const user = requireVerified(request)
      const { id } = parse(
        z.object({ id: z.string().min(1).max(100) }),
        request.params,
      )
      const body = parse(
        z.object({
          locationId: z.string().min(1).max(160).optional(),
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          accuracy: z.number().min(0).max(100000).optional(),
          locationTimestamp: z.string().datetime().optional(),
          idempotencyKey: z.string().uuid(),
        }),
        request.body,
      )
      const client = await db.connect()
      try {
        await client.query("BEGIN")
        const result = await activateDeal({
          db: client,
          userId: user.id,
          dealId: id,
          request: {
            locationId: body.locationId,
            latitude: body.lat,
            longitude: body.lng,
            accuracyM: body.accuracy,
            observedAt: body.locationTimestamp,
            idempotencyKey: body.idempotencyKey,
          },
          encryptCoordinate: (value) =>
            encrypt(String(value), config.DATA_ENCRYPTION_KEY),
          decryptPayload: (value) => decrypt(value, config.DATA_ENCRYPTION_KEY),
        })
        await client.query(
          `UPDATE deal_activations SET exact_location_expires_at=now()+($1::text || ' days')::interval WHERE id=$2`,
          [config.ACTIVATION_LOCATION_RETENTION_DAYS, result.activationId],
        )
        if (!result.ok) {
          await client.query("COMMIT")
          const statusCode =
            result.reason === "limit_reached" ||
            result.reason === "activation_expired"
              ? 409
              : result.reason === "deal_unavailable"
                ? 404
                : 422
          return reply
            .code(statusCode)
            .send({ ...result, error: result.message })
        }
        const display = await client.query<{
          title: string
          business_name: string
          location_name: string | null
          location_address: string | null
        }>(
          `SELECT d.title,b.name business_name,bl.location_name,bl.address location_address FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN business_locations bl ON bl.id=$2 WHERE d.id=$1`,
          [id, result.locationId],
        )
        await client.query("COMMIT")
        const details = display.rows[0]
        const instruction = ["pos_button", "cashier_instruction"].includes(
          result.redemptionMethod,
        )
          ? result.redemptionPayload
          : null
        return {
          id: result.activationId,
          activationType: result.activationType,
          status: result.status,
          businessName: details?.business_name,
          locationName: details?.location_name,
          locationAddress: details?.location_address,
          offer: details?.title,
          redemptionMethod: result.redemptionMethod,
          redemptionValue: ["coupon_code", "barcode"].includes(
            result.redemptionMethod,
          )
            ? result.redemptionPayload
            : null,
          barcodeValue:
            result.redemptionMethod === "barcode"
              ? result.redemptionPayload
              : null,
          cashierInstruction: instruction,
          expiresAt: result.expiresAt,
          serverTime: new Date().toISOString(),
          note: result.note,
        }
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
    },
  )

  app.post("/api/deals/:id/save", async (request) => {
    const user = requireUser(request)
    const { id } = parse(z.object({ id: z.string() }), request.params)
    await db.query(
      "INSERT INTO saved_deals(user_id,deal_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [user.id, id],
    )
    return { saved: true }
  })
  app.delete("/api/deals/:id/save", async (request) => {
    const user = requireUser(request)
    const { id } = parse(z.object({ id: z.string() }), request.params)
    await db.query("DELETE FROM saved_deals WHERE user_id=$1 AND deal_id=$2", [
      user.id,
      id,
    ])
    return { saved: false }
  })

  app.post("/api/deals/:id/reveal-code", async (_request, reply) =>
    reply
      .code(410)
      .send({
        error:
          "Direct code reveal has been retired. Use the deal activation flow.",
      }),
  )

  app.post("/api/deals/:id/report-use", async (_request, reply) =>
    reply
      .code(410)
      .send({
        error:
          "Self-reported deal use has been retired. Use the location-verified activation flow.",
      }),
  )

  app.get("/api/me/reported-uses", async (request) => {
    const user = requireUser(request)
    const result = await db.query(
      `SELECT r.id,r.deal_id,r.reported_at,r.estimated_savings_cents,d.title,b.name business_name FROM deal_use_reports r JOIN deals d ON d.id=r.deal_id JOIN businesses b ON b.id=d.business_id WHERE r.user_id=$1 ORDER BY r.reported_at DESC`,
      [user.id],
    )
    return { reports: result.rows }
  })

  app.get("/api/me/activations", async (request) => {
    const user = requireUser(request)
    const result = await db.query(
      `SELECT a.id,a.deal_id,a.activation_type,a.created_at activated_at,a.payload_expires_at,a.distance_m,a.reported_accuracy_m,
      d.title,b.name business_name,bl.location_name,bl.address location_address
      FROM deal_activations a JOIN deals d ON d.id=a.deal_id JOIN businesses b ON b.id=a.business_id
      LEFT JOIN business_locations bl ON bl.id=a.business_location_id
      WHERE a.user_id=$1 AND a.outcome='successful' ORDER BY a.created_at DESC`,
      [user.id],
    )
    return { activations: result.rows }
  })

  app.post("/api/analytics/events", async (request) => {
    const body = parse(
      z.object({
        eventType: z.string(),
        businessId: z.string().nullable().optional(),
        dealId: z.string().nullable().optional(),
        idempotencyKey: z.string().max(100).optional(),
        metadata: z.record(z.string(), z.unknown()).default({}),
      }),
      request.body,
    )
    if (!allowedAnalytics.has(body.eventType))
      throw Object.assign(new Error("Unsupported analytics event."), {
        statusCode: 400,
      })
    await db.query(
      `INSERT INTO analytics_events(id,event_type,user_id,session_key,business_id,deal_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING`,
      [
        randomUUID(),
        body.eventType,
        request.currentUser?.id ?? null,
        request.ip,
        body.businessId ?? null,
        body.dealId ?? null,
        body.idempotencyKey ?? null,
        JSON.stringify(body.metadata),
      ],
    )
    return { ok: true }
  })

  app.post(
    "/api/partner-inquiries",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = parse(
        z
          .object({
            businessName: z.string().trim().min(2).max(140),
            businessEmail: z.email().transform((v) => v.toLowerCase()),
            contactName: z.string().trim().min(2).max(140),
            proposedDeal: z.string().trim().min(5).max(2000),
            posSystem: z.string().trim().min(1).max(160),
            redemptionMethod: z.enum([
              "pos_button",
              "coupon_code",
              "barcode",
              "cashier_instruction",
            ]),
            redemptionValue: z.string().trim().max(2000).nullable().optional(),
            displayLifetimeMinutes: z.coerce.number().int().min(1).max(60),
            usageLimit: z.coerce.number().int().min(1).max(1000).optional(),
            usageLimitWindow: z.enum(["every_visit", "day", "month", "lifetime"]),
            trackingMode: z.enum(["standard_geolocation", "enhanced_pos"]),
            locations: z
              .array(
                z.object({
                  name: z.string().trim().min(1).max(140),
                  address: z.string().trim().min(5).max(300),
                  timezone: z.string().trim().min(3).max(80),
                  radiusMeters: z.coerce.number().int().min(25).max(5000),
                }),
              )
              .min(1)
              .max(100),
          })
          .superRefine((value, context) => {
            if (
              ["coupon_code", "barcode"].includes(value.redemptionMethod) &&
              !value.redemptionValue
            )
              context.addIssue({
                code: "custom",
                path: ["redemptionValue"],
                message: "Enter the code or barcode value.",
              })
          }),
        request.body,
      )
      for (const location of body.locations) {
        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: location.timezone,
          }).format(new Date())
        } catch {
          throw Object.assign(
            new Error(`Enter a valid IANA timezone for ${location.name}.`),
            { statusCode: 400 },
          )
        }
      }
      const applicationId = randomUUID()
      const redemptionPayload =
        body.redemptionValue ||
        (body.redemptionMethod === "pos_button"
          ? "Tap the TeachersVIP discount button in the normal POS."
          : body.redemptionMethod === "cashier_instruction"
            ? "Apply the TeachersVIP educator offer in the normal POS."
            : null)
      const client = await db.connect()
      try {
        await client.query("BEGIN")
        await client.query(
          `INSERT INTO business_applications(id,submitted_by,business_name,contact_name,contact_email,proposed_offer,pos_system,redemption_method,redemption_payload_encrypted,display_ttl_seconds,usage_limit_count,usage_limit_period,usage_limit_scope,tracking_mode)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'offer',$13)`,
          [
            applicationId,
            request.currentUser?.id ?? null,
            body.businessName,
            body.contactName,
            body.businessEmail,
            body.proposedDeal,
            body.posSystem,
            body.redemptionMethod,
            redemptionPayload
              ? encrypt(redemptionPayload, config.DATA_ENCRYPTION_KEY)
              : null,
            body.displayLifetimeMinutes * 60,
            body.usageLimitWindow === "every_visit" ? null : (body.usageLimit ?? 1),
            body.usageLimitWindow === "every_visit" ? "none" : body.usageLimitWindow,
            body.trackingMode,
          ],
        )
        for (const location of body.locations)
          await client.query(
            `INSERT INTO business_application_locations(id,application_id,location_name,address,timezone,geofence_radius_m) VALUES($1,$2,$3,$4,$5,$6)`,
            [
              randomUUID(),
              applicationId,
              location.name,
              location.address,
              location.timezone,
              location.radiusMeters,
            ],
          )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK")
        throw error
      } finally {
        client.release()
      }
      return reply.code(201).send({ ok: true, applicationId })
    },
  )

  app.setErrorHandler((error: any, _request, reply) => {
    app.log.error(error)
    reply
      .code(error.statusCode ?? 500)
      .send({
        error: error.statusCode ? error.message : "Something went wrong.",
      })
  })

  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist",
  )
  if (config.NODE_ENV === "production" || existsSync(root)) {
    app.register(fastifyStatic, { root, wildcard: false })
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found." })
        : reply.sendFile("index.html"),
    )
  }
  return app
}
