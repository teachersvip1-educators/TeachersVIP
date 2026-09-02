import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { Resend } from 'resend'
import { z } from 'zod'
import type { Config } from './config.js'
import type { DbPool } from './db/pool.js'
import { decrypt, hashPassword, randomToken, tokenHash, verifyPassword } from './security.js'
import { createPass2UClient } from './integrations/pass2u.js'

const SESSION_COOKIE = 'teachersvip_session'
const allowedAnalytics = new Set(['business_listing_view', 'deal_view', 'website_click', 'directions_click', 'promo_code_reveal', 'reported_deal_use', 'estimated_savings'])

type UserRow = { id: string; personal_email: string; first_name: string; last_name: string; mobile: string | null; city: string; sms_consent: boolean; work_email: string | null; educator_verified_at: string | null; is_superadmin: boolean }

declare module 'fastify' {
  interface FastifyRequest { currentUser: UserRow | null }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = String(issue?.path[0] ?? '')
    const labels: Record<string, string> = { firstName: 'First name', lastName: 'Last name', personalEmail: 'Personal email', workEmail: 'School/work email', mobile: 'Mobile number', city: 'City', password: 'Password', businessName: 'Business name', businessEmail: 'Business email', proposedDeal: 'Proposed deal', email: 'Email' }
    const label = labels[field] ?? 'This field'
    let message = `${label} is invalid.`
    if (issue?.code === 'too_small') message = `${label} must contain at least ${issue.minimum} characters.`
    else if (issue?.code === 'too_big') message = `${label} is too long.`
    else if (issue?.code === 'invalid_type') message = `${label} is required.`
    else if (issue?.code === 'invalid_format' && issue.format === 'email') message = `Enter a valid ${label.toLowerCase()}.`
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

function newUserEmailHtml(user: { firstName: string; lastName: string; email: string; city: string }) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;padding:28px"><h1>New TeachersVIP member</h1><p>A new educator account has been registered.</p><p><strong>Name:</strong> ${user.firstName} ${user.lastName}<br><strong>Email:</strong> ${user.email}<br><strong>City:</strong> ${user.city}</p></body></html>`
}

export function buildApp({ config, db }: { config: Config; db: DbPool }) {
  const app = Fastify({ bodyLimit: 4 * 1024 * 1024, logger: { redact: ['req.headers.cookie', 'req.body.password', 'req.body.pin', 'req.body.promoCode', 'req.body.imageUrl'] }, trustProxy: true })
  const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null
  const pass2u = createPass2UClient(config)

  app.register(cookie, { secret: config.SESSION_SECRET })
  app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production' ? {
      directives: { imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'] },
    } : false,
  })
  app.register(rateLimit, { max: 180, timeWindow: '1 minute' })

  app.decorateRequest('currentUser', null)
  app.addHook('onRequest', async request => {
    if (config.NODE_ENV !== 'production' || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
    const origin = request.headers.origin
    if (!origin) return
    const forwardedHost = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0]!.trim()
    const forwardedProto = String(request.headers['x-forwarded-proto'] ?? request.protocol).split(',')[0]!.trim()
    const configuredOrigin = new URL(config.APP_URL).origin
    const requestOrigin = forwardedHost ? new URL(`${forwardedProto}://${forwardedHost}`).origin : null
    if (origin !== configuredOrigin && origin !== requestOrigin) throw Object.assign(new Error('Request origin is not allowed.'), { statusCode: 403 })
  })
  app.addHook('preHandler', async request => {
    const raw = request.cookies[SESSION_COOKIE]
    if (!raw) return
    const result = await db.query<UserRow>(`SELECT u.id,u.personal_email,u.first_name,u.last_name,u.mobile,u.city,u.sms_consent,u.work_email,u.educator_verified_at,u.is_superadmin
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`, [tokenHash(raw)])
    request.currentUser = result.rows[0] ?? null
  })

  const requireUser = (request: FastifyRequest) => {
    if (!request.currentUser) throw Object.assign(new Error('Authentication required'), { statusCode: 401 })
    return request.currentUser
  }
  const requireVerified = (request: FastifyRequest) => {
    const user = requireUser(request)
    if (!user.educator_verified_at) throw Object.assign(new Error('Educator verification required'), { statusCode: 403 })
    return user
  }
  const configuredSuperadmins = config.SUPERADMIN_EMAILS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
  const isSuperadmin = (user: UserRow | null) => Boolean(user && (user.is_superadmin || configuredSuperadmins.includes(user.personal_email.toLowerCase())))
  const requireSuperadmin = (request: FastifyRequest) => {
    const user = requireUser(request)
    if (!isSuperadmin(user)) throw Object.assign(new Error('Superadmin access required.'), { statusCode: 403 })
    return user
  }

  async function createSession(reply: any, userId: string) {
    const token = randomToken()
    await db.query('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval \'30 days\')', [randomUUID(), userId, tokenHash(token)])
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  const publicOrigin = (request: FastifyRequest) => {
    const configured = new URL(config.APP_URL).origin
    if (config.NODE_ENV === 'production' && configured.includes('localhost')) {
      const host = String(request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0]!.trim()
      const protocol = String(request.headers['x-forwarded-proto'] ?? request.protocol).split(',')[0]!.trim()
      if (host) return `${protocol}://${host}`
    }
    return configured
  }

  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (_request, reply) => {
    try { await db.query('SELECT 1'); return { status: 'ready' } }
    catch { return reply.code(503).send({ status: 'not_ready' }) }
  })

  app.post('/api/auth/register', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parse(z.object({
      firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(80),
      personalEmail: z.email().transform(v => v.toLowerCase()), mobile: z.string().trim().max(30).optional(),
      city: z.string().trim().min(2).max(100), password: z.string().min(10).max(128), smsConsent: z.boolean().default(false),
    }), request.body)
    const id = randomUUID()
    try {
      await db.query(`INSERT INTO users(id,personal_email,password_hash,first_name,last_name,mobile,city,sms_consent,sms_consent_version,sms_consented_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, body.personalEmail, await hashPassword(body.password), body.firstName, body.lastName, body.mobile || null, body.city, body.smsConsent, body.smsConsent ? 'v1-2026-08' : null, body.smsConsent ? new Date() : null])
      await db.query('INSERT INTO member_cards(id,user_id,member_id) VALUES($1,$2,$3)', [randomUUID(), id, `TVIP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`])
    } catch (error: any) {
      if (error.code === '23505') return reply.code(409).send({ error: 'An account already exists for this email.' })
      throw error
    }
    if (resend && config.RESEND_TO_EMAIL) {
      const { error } = await resend.emails.send({ from: config.RESEND_FROM_EMAIL, to: config.RESEND_TO_EMAIL, subject: 'New TeachersVIP member registration', html: newUserEmailHtml({ firstName: body.firstName, lastName: body.lastName, email: body.personalEmail, city: body.city }), text: `New TeachersVIP member\n\nName: ${body.firstName} ${body.lastName}\nEmail: ${body.personalEmail}\nCity: ${body.city}` })
      if (error) app.log.error({ resendError: error }, 'Resend rejected the new-user notification')
    }
    await createSession(reply, id)
    return reply.code(201).send({ ok: true })
  })

  app.post('/api/auth/sign-in', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = parse(z.object({ email: z.email().transform(v => v.toLowerCase()), password: z.string().min(1) }), request.body)
    const result = await db.query<{ id: string; password_hash: string }>('SELECT id,password_hash FROM users WHERE personal_email=$1', [body.email])
    const user = result.rows[0]
    if (!user || !(await verifyPassword(body.password, user.password_hash))) return reply.code(401).send({ error: 'Invalid email or password.' })
    await createSession(reply, user.id)
    return { ok: true }
  })

  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async request => {
    const { email } = parse(z.object({ email: z.email().transform(v => v.toLowerCase()) }), request.body)
    const result = await db.query<{ id: string; personal_email: string }>('SELECT id,personal_email FROM users WHERE personal_email=$1', [email])
    const user = result.rows[0]
    if (!user) return { ok: true }
    const token = randomToken()
    await db.query('INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval \'30 minutes\')', [randomUUID(), user.id, tokenHash(token)])
    const resetUrl = `${config.APP_URL}/reset-password?token=${encodeURIComponent(token)}`
    if (resend) {
      const { error } = await resend.emails.send({ from: config.RESEND_FROM_EMAIL, to: user.personal_email, subject: 'Reset your TeachersVIP password', html: passwordResetEmailHtml(resetUrl), text: `Reset your TeachersVIP password\n\nThis secure link expires in 30 minutes:\n\n${resetUrl}` })
      if (error) throw Object.assign(new Error('The password reset email could not be sent. Please try again shortly.'), { statusCode: 502 })
    } else if (config.NODE_ENV === 'development') app.log.info({ resetUrl }, 'Resend is not configured; development password reset URL')
    return { ok: true, ...(config.NODE_ENV === 'development' && !resend ? { resetUrl } : {}) }
  })

  app.post('/api/auth/reset-password', async request => {
    const body = parse(z.object({ token: z.string().min(20), password: z.string().min(10).max(128) }), request.body)
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string; user_id: string }>('SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash(body.token)])
      const reset = result.rows[0]
      if (!reset) throw Object.assign(new Error('This password reset link is invalid or expired.'), { statusCode: 400 })
      await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [await hashPassword(body.password), reset.user_id])
      await client.query('UPDATE password_resets SET consumed_at=now() WHERE id=$1', [reset.id])
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [reset.user_id])
      await client.query('COMMIT')
      return { ok: true }
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  })

  app.post('/api/auth/sign-out', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE]
    if (raw) await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [tokenHash(raw)])
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/auth/session', async request => ({ user: request.currentUser ? { ...request.currentUser, verified: Boolean(request.currentUser.educator_verified_at), is_superadmin: isSuperadmin(request.currentUser) } : null }))

  app.get('/api/auth/admin-registration-status', async () => {
    const result = await db.query<{ available: boolean }>(`SELECT (completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE is_superadmin)) available FROM superadmin_bootstrap WHERE id=true`)
    return { available: Boolean(result.rows[0]?.available) }
  })

  app.post('/api/auth/admin-register', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = parse(z.object({
      pin: z.string().regex(/^\d{4,12}$/), firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(80),
      email: z.email().transform(value => value.toLowerCase()), password: z.string().min(12).max(128), city: z.string().trim().min(2).max(100),
    }), request.body)
    if (body.pin !== config.SUPERADMIN_REGISTRATION_PIN) return reply.code(403).send({ error: 'The registration PIN is incorrect.' })
    const client = await db.connect()
    let userId = randomUUID()
    try {
      await client.query('BEGIN')
      const claim = await client.query<{ available: boolean }>(`SELECT (completed_at IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE is_superadmin)) available FROM superadmin_bootstrap WHERE id=true FOR UPDATE`)
      if (!claim.rows[0]?.available) { await client.query('ROLLBACK'); return reply.code(409).send({ error: 'Superadmin registration has already been completed.' }) }
      const existing = await client.query<{ id: string; password_hash: string }>('SELECT id,password_hash FROM users WHERE personal_email=$1 FOR UPDATE', [body.email])
      if (existing.rows[0]) {
        if (!(await verifyPassword(body.password, existing.rows[0].password_hash))) { await client.query('ROLLBACK'); return reply.code(401).send({ error: 'That email already has an account. Enter its current password to continue.' }) }
        userId = existing.rows[0].id
        await client.query('UPDATE users SET first_name=$1,last_name=$2,city=$3,educator_verified_at=COALESCE(educator_verified_at,now()),is_superadmin=true,updated_at=now() WHERE id=$4', [body.firstName, body.lastName, body.city, userId])
      } else {
        await client.query(`INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city,educator_verified_at,is_superadmin) VALUES($1,$2,$3,$4,$5,$6,now(),true)`, [userId, body.email, await hashPassword(body.password), body.firstName, body.lastName, body.city])
      }
      await client.query('INSERT INTO member_cards(id,user_id,member_id) VALUES($1,$2,$3)', [randomUUID(), userId, `TVIP-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`])
      await client.query('UPDATE superadmin_bootstrap SET completed_at=now(),completed_by=$1 WHERE id=true', [userId])
      await client.query('COMMIT')
    } catch (error: any) {
      await client.query('ROLLBACK')
      if (error.code === '23505') return reply.code(409).send({ error: 'An account already exists for this email.' })
      throw error
    } finally { client.release() }
    await createSession(reply, userId)
    return reply.code(201).send({ ok: true })
  })

  app.get('/api/admin/overview', async request => {
    const admin = requireSuperadmin(request)
    const optionalQuery = async <T extends { rows: unknown[] }>(query: Promise<T>, fallback: T) => {
      try { return await query } catch (error) { app.log.warn({ error }, 'Optional admin dashboard query failed'); return fallback }
    }
    const [businesses, deals, members, uses, inquiries, audit] = await Promise.all([
      optionalQuery(db.query(`SELECT id,name,category,description,image_url,website_url,distance,hours,is_open,address,latitude,longitude,published FROM businesses ORDER BY name`), { rows: [] } as { rows: unknown[] }),
      optionalQuery(db.query(`SELECT d.id,d.business_id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,d.image_url,d.published,d.starts_at,d.ends_at,d.created_at,b.name business_name FROM deals d JOIN businesses b ON b.id=d.business_id ORDER BY d.created_at DESC`), { rows: [] } as { rows: unknown[] }),
      optionalQuery(db.query(`SELECT COUNT(*)::int count FROM users`), { rows: [{ count: 0 }] } as { rows: { count: number }[] }),
      optionalQuery(db.query(`SELECT COUNT(*)::int count FROM deal_use_reports`), { rows: [{ count: 0 }] } as { rows: { count: number }[] }),
      optionalQuery(db.query(`SELECT id,business_name,business_email,proposed_deal,status,created_at FROM partner_inquiries ORDER BY created_at DESC LIMIT 50`), { rows: [] } as { rows: unknown[] }),
      optionalQuery(db.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.first_name,u.last_name FROM admin_audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 50`), { rows: [] } as { rows: unknown[] }),
    ])
    return { businesses: businesses.rows, deals: deals.rows, inquiries: inquiries.rows, audit: audit.rows, metrics: { members: members.rows[0].count, uses: uses.rows[0].count }, adminEmail: admin.personal_email }
  })

  app.post('/api/admin/businesses', async request => {
    requireSuperadmin(request)
    const body = parse(z.object({ id: z.string().trim().regex(/^[a-z0-9-]+$/).max(80), name: z.string().trim().min(2).max(140), category: z.string().trim().min(2).max(60), description: z.string().trim().min(5).max(1000), imageUrl: z.string().trim().min(1).max(500), websiteUrl: z.url().nullable().optional(), distance: z.string().trim().max(120).nullable().optional(), hours: z.string().trim().max(120).nullable().optional(), isOpen: z.boolean().nullable().optional(), address: z.string().trim().max(200).nullable().optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() }), request.body)
    const result = await db.query(`INSERT INTO businesses(id,name,category,description,image_url,website_url,distance,hours,is_open,address,latitude,longitude) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [body.id, body.name, body.category, body.description, body.imageUrl, body.websiteUrl || null, body.distance || null, body.hours || null, body.isOpen ?? null, body.address || null, body.latitude ?? null, body.longitude ?? null])
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'created','business',$3,$4)`, [randomUUID(), request.currentUser!.id, result.rows[0].id, JSON.stringify({ name: body.name })])
    return { ok: true }
  })

  app.patch('/api/admin/businesses/:id', async request => {
    requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().min(1) }), request.params)
    const body = parse(z.object({ name: z.string().trim().min(2).max(140).optional(), category: z.string().trim().min(2).max(60).optional(), description: z.string().trim().min(5).max(1000).optional(), imageUrl: z.string().trim().min(1).max(500).optional(), websiteUrl: z.url().nullable().optional(), distance: z.string().trim().max(120).nullable().optional(), hours: z.string().trim().max(120).nullable().optional(), isOpen: z.boolean().nullable().optional(), address: z.string().trim().max(200).nullable().optional(), published: z.boolean().optional() }).refine(value => Object.keys(value).length > 0), request.body)
    const mappings: Record<string, string> = { name: 'name', category: 'category', description: 'description', imageUrl: 'image_url', websiteUrl: 'website_url', distance: 'distance', hours: 'hours', isOpen: 'is_open', address: 'address', published: 'published' }
    const fields = Object.entries(body).filter(([, value]) => value !== undefined)
    await db.query(`UPDATE businesses SET ${fields.map(([field], index) => `${mappings[field]}=$${index + 1}`).join(',')} WHERE id=$${fields.length + 1}`, [...fields.map(([, value]) => value), id])
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'updated','business',$3,$4)`, [randomUUID(), request.currentUser!.id, id, JSON.stringify(Object.fromEntries(fields))])
    return { ok: true }
  })

  app.post('/api/admin/deals', async request => {
    requireSuperadmin(request)
    const body = parse(z.object({ id: z.string().trim().regex(/^[a-z0-9-]+$/).max(100), businessId: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(160), description: z.string().trim().min(5).max(1000), channel: z.enum(['in_person', 'online']), category: z.string().trim().min(2).max(60), restrictions: z.string().trim().min(2).max(1000), promoCode: z.string().trim().max(200).optional(), imageUrl: z.string().trim().max(2500000).nullable().optional(), estimatedSavingsCents: z.number().int().min(0).max(1000000), featured: z.boolean().default(false), sponsored: z.boolean().default(false), giveaway: z.boolean().default(false), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }), request.body)
    await db.query(`INSERT INTO deals(id,business_id,title,description,channel,category,restrictions,promo_code_encrypted,estimated_savings_cents,featured,sponsored,giveaway,image_url,published,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14,$15)`, [body.id, body.businessId, body.title, body.description, body.channel, body.category, body.restrictions, body.promoCode ? encrypt(body.promoCode, config.DATA_ENCRYPTION_KEY) : null, body.estimatedSavingsCents, body.featured, body.sponsored, body.giveaway, body.imageUrl || null, body.startsAt || null, body.endsAt || null])
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'created','deal',$3,$4)`, [randomUUID(), request.currentUser!.id, body.id, JSON.stringify({ businessId: body.businessId, title: body.title })])
    return { ok: true }
  })

  app.patch('/api/admin/deals/:id', async request => {
    requireSuperadmin(request)
    const { id } = parse(z.object({ id: z.string().min(1) }), request.params)
    const body = parse(z.object({ published: z.boolean().optional(), featured: z.boolean().optional(), sponsored: z.boolean().optional(), title: z.string().trim().min(2).max(160).optional(), description: z.string().trim().min(5).max(1000).optional(), restrictions: z.string().trim().min(2).max(1000).optional(), imageUrl: z.string().trim().max(2500000).nullable().optional(), estimatedSavingsCents: z.number().int().min(0).max(1000000).optional(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }).refine(value => Object.keys(value).length > 0), request.body)
    const mappings: Record<string, string> = { published: 'published', featured: 'featured', sponsored: 'sponsored', title: 'title', description: 'description', restrictions: 'restrictions', imageUrl: 'image_url', estimatedSavingsCents: 'estimated_savings_cents', startsAt: 'starts_at', endsAt: 'ends_at' }
    const fields = Object.entries(body).filter(([, value]) => value !== undefined)
    await db.query(`UPDATE deals SET ${fields.map(([field], index) => `${mappings[field]}=$${index + 1}`).join(',')} WHERE id=$${fields.length + 1}`, [...fields.map(([, value]) => value), id])
    await db.query(`INSERT INTO admin_audit_log(id,user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'updated','deal',$3,$4)`, [randomUUID(), request.currentUser!.id, id, JSON.stringify(Object.fromEntries(fields))])
    return { ok: true }
  })

  app.post('/api/verification/send', { config: { rateLimit: { max: 4, timeWindow: '15 minutes' } } }, async request => {
    const user = requireUser(request)
    const { workEmail } = parse(z.object({ workEmail: z.email().transform(v => v.toLowerCase()) }), request.body)
    const token = randomToken()
    await db.query('INSERT INTO educator_verifications(id,user_id,work_email,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval \'30 minutes\')', [randomUUID(), user.id, workEmail, tokenHash(token)])
    const verificationUrl = `${publicOrigin(request)}/verify?token=${encodeURIComponent(token)}`
    if (resend) {
      const emailLogo = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/teachersvip-logo.png'))
      const { error } = await resend.emails.send({ from: config.RESEND_FROM_EMAIL, to: workEmail, subject: 'Verify your TeachersVIP educator email', html: verificationEmailHtml(verificationUrl), text: `Verify your educator email\n\nConfirm your email to continue to your personalized TeachersVIP card and educator-only offers. This secure link expires in 30 minutes:\n\n${verificationUrl}\n\nIf you did not request this email, you can safely ignore it.\n\nFree for educators. Always.`, attachments: [{ filename: 'teachersvip-logo.png', content: emailLogo, contentType: 'image/png', contentId: 'teachersvip-logo' }] })
      if (error) {
        app.log.error({ resendError: error }, 'Resend rejected the verification email')
        throw Object.assign(new Error('The verification email could not be sent. Please try again shortly.'), { statusCode: 502 })
      }
    } else app.log.warn({ verificationUrl }, 'Resend is not configured; returning a temporary verification URL for testing')
    return { ok: true, ...(!resend ? { verificationUrl } : {}) }
  })

  app.post('/api/verification/confirm', async (request, reply) => {
    const { token } = parse(z.object({ token: z.string().min(20) }), request.body)
    const client = await db.connect()
    let verifiedUserId = ''
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string; user_id: string; work_email: string }>('SELECT id,user_id,work_email FROM educator_verifications WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash(token)])
      const record = result.rows[0]
      if (!record) throw Object.assign(new Error('This verification link is invalid or expired.'), { statusCode: 400 })
      await client.query('UPDATE educator_verifications SET consumed_at=now() WHERE id=$1', [record.id])
      await client.query('UPDATE users SET work_email=$1,educator_verified_at=now(),updated_at=now() WHERE id=$2', [record.work_email, record.user_id])
      await client.query('COMMIT')
      verifiedUserId = record.user_id
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
    await createSession(reply, verifiedUserId)
    return { ok: true }
  })

  app.get('/api/me', async request => {
    const user = requireUser(request)
    const result = await db.query(`SELECT u.id,u.personal_email,u.first_name,u.last_name,u.mobile,u.city,u.sms_consent,u.work_email,u.educator_verified_at,m.member_id,
      COALESCE((SELECT sum(estimated_savings_cents) FROM deal_use_reports r WHERE r.user_id=u.id),0)::int estimated_savings_cents,
      COALESCE((SELECT count(*) FROM deal_use_reports r WHERE r.user_id=u.id),0)::int reported_uses
      FROM users u JOIN member_cards m ON m.user_id=u.id WHERE u.id=$1`, [user.id])
    return { profile: result.rows[0] }
  })

  app.patch('/api/me', async request => {
    const user = requireUser(request)
    const body = parse(z.object({ firstName: z.string().trim().min(2).max(80), lastName: z.string().trim().min(2).max(80), mobile: z.string().trim().max(30).nullable(), city: z.string().trim().min(2).max(100), smsConsent: z.boolean() }), request.body)
    await db.query(`UPDATE users SET first_name=$1,last_name=$2,mobile=$3,city=$4,sms_consent=$5,
      sms_consent_version=CASE WHEN $5 THEN 'v1-2026-08' ELSE sms_consent_version END,
      sms_consented_at=CASE WHEN $5 AND NOT sms_consent THEN now() ELSE sms_consented_at END,updated_at=now() WHERE id=$6`, [body.firstName, body.lastName, body.mobile, body.city, body.smsConsent, user.id])
    return { ok: true }
  })

  app.get('/api/me/vip-card', async request => {
    const user = requireVerified(request)
    const result = await db.query('SELECT member_id,status,issued_at FROM member_cards WHERE user_id=$1', [user.id])
    const wallet = await db.query<{ status: string; provider_pass_id: string | null }>('SELECT status,provider_pass_id FROM wallet_passes WHERE user_id=$1 AND provider=$2', [user.id, 'pass2u'])
    return { card: { ...result.rows[0], teacherName: `${user.first_name} ${user.last_name}`, verified: true, walletStatus: wallet.rows[0]?.status ?? (pass2u.ready ? 'available' : 'not_configured'), walletDownloadUrl: wallet.rows[0]?.provider_pass_id ? `https://www.pass2u.net/d/${encodeURIComponent(wallet.rows[0].provider_pass_id!)}` : null } }
  })

  app.post('/api/me/wallet-pass', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async request => {
    const user = requireVerified(request)
    if (!pass2u.ready) throw Object.assign(new Error('Pass2U automation is not configured.'), { statusCode: 503 })
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`INSERT INTO wallet_passes(id,user_id,provider,status) VALUES($1,$2,'pass2u','pending') ON CONFLICT (user_id,provider) DO NOTHING`, [randomUUID(), user.id])
      const existing = await client.query<{ provider_pass_id: string | null; status: string }>(`SELECT provider_pass_id,status FROM wallet_passes WHERE user_id=$1 AND provider='pass2u' FOR UPDATE`, [user.id])
      if (existing.rows[0]?.provider_pass_id && existing.rows[0].status === 'active') {
        await client.query('COMMIT')
        return { status: 'active', downloadUrl: `https://www.pass2u.net/d/${encodeURIComponent(existing.rows[0].provider_pass_id)}` }
      }
      const member = await client.query<{ member_id: string }>('SELECT member_id FROM member_cards WHERE user_id=$1', [user.id])
      try {
        const created = await pass2u.createMembershipPass({ teacherName: `${user.first_name} ${user.last_name}`, memberId: member.rows[0]!.member_id })
        await client.query(`UPDATE wallet_passes SET provider_pass_id=$1,status='active',last_error=NULL,updated_at=now() WHERE user_id=$2 AND provider='pass2u'`, [created.passId, user.id])
        await client.query('COMMIT')
        return { status: 'active', downloadUrl: created.downloadUrl }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pass2U request failed.'
        await client.query(`UPDATE wallet_passes SET status='failed',last_error=$1,updated_at=now() WHERE user_id=$2 AND provider='pass2u'`, [message, user.id])
        await client.query('COMMIT')
        throw error
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  })

  app.get('/api/deals', async request => {
    const query = parse(z.object({ q: z.string().optional(), category: z.string().optional(), channel: z.enum(['in_person', 'online']).optional(), saved: z.coerce.boolean().optional() }), request.query)
    const userId = request.currentUser?.id ?? null
    const result = await db.query(`SELECT d.id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,
      b.id business_id,b.name business_name,b.description business_description,COALESCE(d.image_url,b.image_url) image_url,b.website_url,b.distance,b.hours,b.is_open,b.address,b.latitude,b.longitude,
      EXISTS(SELECT 1 FROM saved_deals s WHERE s.deal_id=d.id AND s.user_id=$1) saved,
      EXISTS(SELECT 1 FROM deal_use_reports r WHERE r.deal_id=d.id AND r.user_id=$1) used
      FROM deals d JOIN businesses b ON b.id=d.business_id
      WHERE d.published AND b.published AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now()) AND ($2::text IS NULL OR d.category=$2) AND ($3::text IS NULL OR d.channel=$3)
      AND ($4::text IS NULL OR d.title ILIKE '%'||$4||'%' OR b.name ILIKE '%'||$4||'%')
      AND (NOT $5::boolean OR EXISTS(SELECT 1 FROM saved_deals s WHERE s.deal_id=d.id AND s.user_id=$1))
      ORDER BY d.featured DESC,d.sponsored DESC,b.name`, [userId, query.category ?? null, query.channel ?? null, query.q ?? null, query.saved ?? false])
    return { deals: result.rows }
  })

  app.get('/api/deals/:id', async (request, reply) => {
    const { id } = parse(z.object({ id: z.string() }), request.params)
    const result = await db.query(`SELECT d.id,d.title,d.description,d.channel,d.category,d.restrictions,d.estimated_savings_cents,d.featured,d.sponsored,d.giveaway,
      b.id business_id,b.name business_name,b.description business_description,COALESCE(d.image_url,b.image_url) image_url,b.website_url,b.distance,b.hours,b.is_open,b.address,b.latitude,b.longitude
      FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.published AND b.published AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())`, [id])
    if (!result.rows[0]) return reply.code(404).send({ error: 'Deal not found.' })
    return { deal: result.rows[0] }
  })

  app.post('/api/deals/:id/save', async request => {
    const user = requireUser(request); const { id } = parse(z.object({ id: z.string() }), request.params)
    await db.query('INSERT INTO saved_deals(user_id,deal_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.id, id]); return { saved: true }
  })
  app.delete('/api/deals/:id/save', async request => {
    const user = requireUser(request); const { id } = parse(z.object({ id: z.string() }), request.params)
    await db.query('DELETE FROM saved_deals WHERE user_id=$1 AND deal_id=$2', [user.id, id]); return { saved: false }
  })

  app.post('/api/deals/:id/reveal-code', async request => {
    const user = requireVerified(request); const { id } = parse(z.object({ id: z.string() }), request.params)
    const result = await db.query<{ promo_code_encrypted: string | null; channel: string; business_id: string }>('SELECT promo_code_encrypted,channel,business_id FROM deals WHERE id=$1 AND published AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())', [id])
    const deal = result.rows[0]
    if (!deal || deal.channel !== 'online' || !deal.promo_code_encrypted) throw Object.assign(new Error('No promotional code is available for this deal.'), { statusCode: 404 })
    await db.query('INSERT INTO analytics_events(id,event_type,user_id,business_id,deal_id) VALUES($1,$2,$3,$4,$5)', [randomUUID(), 'promo_code_reveal', user.id, deal.business_id, id])
    return { promoCode: decrypt(deal.promo_code_encrypted, config.DATA_ENCRYPTION_KEY) }
  })

  app.post('/api/deals/:id/report-use', async request => {
    const user = requireVerified(request); const { id } = parse(z.object({ id: z.string() }), request.params)
    const { idempotencyKey } = parse(z.object({ idempotencyKey: z.string().uuid() }), request.body)
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      const deal = await client.query<{ estimated_savings_cents: number; business_id: string }>('SELECT estimated_savings_cents,business_id FROM deals WHERE id=$1 AND published AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>now())', [id])
      if (!deal.rows[0]) throw Object.assign(new Error('Deal not found.'), { statusCode: 404 })
      const reportId = randomUUID()
      const inserted = await client.query(`INSERT INTO deal_use_reports(id,user_id,deal_id,idempotency_key,estimated_savings_cents) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING RETURNING id`, [reportId, user.id, id, idempotencyKey, deal.rows[0].estimated_savings_cents])
      if (inserted.rowCount) {
        await client.query(`INSERT INTO analytics_events(id,event_type,user_id,business_id,deal_id,metadata) VALUES($1,'reported_deal_use',$2,$3,$4,$5)`, [randomUUID(), user.id, deal.rows[0].business_id, id, JSON.stringify({ estimatedSavingsCents: deal.rows[0].estimated_savings_cents })])
        await client.query(`INSERT INTO analytics_events(id,event_type,user_id,business_id,deal_id,metadata) VALUES($1,'estimated_savings',$2,$3,$4,$5)`, [randomUUID(), user.id, deal.rows[0].business_id, id, JSON.stringify({ amountCents: deal.rows[0].estimated_savings_cents })])
      }
      const totals = await client.query<{ reported_uses: number; estimated_savings_cents: number }>(`SELECT COUNT(*)::int reported_uses,COALESCE(SUM(estimated_savings_cents),0)::int estimated_savings_cents FROM deal_use_reports WHERE user_id=$1`, [user.id])
      await client.query('COMMIT')
      return { ok: true, duplicate: !inserted.rowCount, addedSavingsCents: inserted.rowCount ? deal.rows[0].estimated_savings_cents : 0, reportedUses: totals.rows[0].reported_uses, estimatedSavingsCents: totals.rows[0].estimated_savings_cents }
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  })

  app.get('/api/me/reported-uses', async request => {
    const user = requireUser(request)
    const result = await db.query(`SELECT r.id,r.deal_id,r.reported_at,r.estimated_savings_cents,d.title,b.name business_name FROM deal_use_reports r JOIN deals d ON d.id=r.deal_id JOIN businesses b ON b.id=d.business_id WHERE r.user_id=$1 ORDER BY r.reported_at DESC`, [user.id])
    return { reports: result.rows }
  })

  app.post('/api/analytics/events', async request => {
    const body = parse(z.object({ eventType: z.string(), businessId: z.string().nullable().optional(), dealId: z.string().nullable().optional(), idempotencyKey: z.string().max(100).optional(), metadata: z.record(z.string(), z.unknown()).default({}) }), request.body)
    if (!allowedAnalytics.has(body.eventType)) throw Object.assign(new Error('Unsupported analytics event.'), { statusCode: 400 })
    await db.query(`INSERT INTO analytics_events(id,event_type,user_id,session_key,business_id,deal_id,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT DO NOTHING`, [randomUUID(), body.eventType, request.currentUser?.id ?? null, request.ip, body.businessId ?? null, body.dealId ?? null, body.idempotencyKey ?? null, JSON.stringify(body.metadata)])
    return { ok: true }
  })

  app.post('/api/partner-inquiries', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = parse(z.object({ businessName: z.string().trim().min(2).max(140), businessEmail: z.email().transform(v => v.toLowerCase()), proposedDeal: z.string().trim().min(5).max(1000) }), request.body)
    await db.query('INSERT INTO partner_inquiries(id,user_id,business_name,business_email,proposed_deal) VALUES($1,$2,$3,$4,$5)', [randomUUID(), request.currentUser?.id ?? null, body.businessName, body.businessEmail, body.proposedDeal])
    return reply.code(201).send({ ok: true })
  })

  app.setErrorHandler((error: any, _request, reply) => {
    app.log.error(error)
    reply.code(error.statusCode ?? 500).send({ error: error.statusCode ? error.message : 'Something went wrong.' })
  })

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  if (config.NODE_ENV === 'production' || existsSync(root)) {
    app.register(fastifyStatic, { root, wildcard: false })
    app.setNotFoundHandler((request, reply) => request.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found.' }) : reply.sendFile('index.html'))
  }
  return app
}
