import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { DbPool } from '../db/pool.js'
import { OFFER_CTA_LABELS, OFFER_RESPONSE_LABELS, type OfferCtaType } from '../../shared/offer-cta.js'
import type { RsvpConfirmation } from '../emails/rsvp-confirmation.js'

export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  // Spreadsheet exports must not execute educator-supplied names as formulas.
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

type Authorize = (request: FastifyRequest) => { id: string; first_name?: string }
type RsvpSubmission = RsvpConfirmation & { business_name: string; deal_id: string }
type RsvpEmailSender = (submission: RsvpSubmission, idempotencyKey: string) => Promise<boolean>

export function registerOfferInterestRoutes(app: FastifyInstance, db: DbPool, requireVerified: Authorize, requireSuperadmin: Authorize, sendRsvpConfirmation?: RsvpEmailSender) {
  async function deliverRsvpConfirmation(id: string, userId: string, forceResend: boolean) {
    if (!sendRsvpConfirmation) return { sent: false, unavailable: true }
    const claimed = await db.query<RsvpSubmission & { rsvp_confirmation_attempt_key: string }>(
      `UPDATE offer_interest_submissions s
       SET rsvp_confirmation_claimed_at=now(),
           rsvp_confirmation_attempted_at=now(),
           rsvp_confirmation_attempt_key=CASE
             WHEN $3::boolean AND (
               s.rsvp_confirmation_attempt_key IS NULL
               OR (
                 s.rsvp_confirmation_sent_at IS NOT NULL
                 AND (
                   s.rsvp_confirmation_attempted_at IS NULL
                   OR s.rsvp_confirmation_attempted_at <= s.rsvp_confirmation_sent_at
                 )
               )
             ) THEN $4::uuid
             ELSE COALESCE(s.rsvp_confirmation_attempt_key,$4::uuid)
           END
       FROM users u, deals d
       WHERE s.id=$1 AND s.user_id=$2 AND s.cta_type='rsvp'
         AND u.id=s.user_id AND d.id=s.deal_id
         AND (s.rsvp_confirmation_claimed_at IS NULL OR s.rsvp_confirmation_claimed_at < now()-interval '5 minutes')
         AND (s.rsvp_confirmation_attempted_at IS NULL OR s.rsvp_confirmation_attempted_at < now()-interval '1 minute')
         AND ($3::boolean OR s.rsvp_confirmation_sent_at IS NULL)
       RETURNING s.id,s.email,s.event_name,s.business_name,s.deal_id,u.work_email verified_school_email,
         COALESCE(NULLIF(u.first_name,''),'there') first_name,
         d.event_date_time,d.event_location,s.rsvp_confirmation_attempt_key`,
      [id, userId, forceResend, randomUUID()],
    )
    const submission = claimed.rows[0]
    if (!submission) {
      const state = await db.query<{ rsvp_confirmation_sent_at: string | null }>(
        `SELECT rsvp_confirmation_sent_at FROM offer_interest_submissions
         WHERE id=$1 AND user_id=$2 AND cta_type='rsvp'`, [id, userId],
      )
      if (!state.rows.length) return { sent: false, notFound: true }
      if (!forceResend && state.rows[0].rsvp_confirmation_sent_at) return { sent: true }
      return { sent: false, throttled: true }
    }

    const idempotencyKey = `rsvp-confirmation/${submission.id}/${submission.rsvp_confirmation_attempt_key}`
    let sent = false
    try {
      sent = await sendRsvpConfirmation(submission, idempotencyKey)
    } catch (error) {
      app.log.error({ error, submissionId: submission.id }, 'RSVP confirmation email failed')
    }
    await db.query(
      `UPDATE offer_interest_submissions
       SET rsvp_confirmation_sent_at=CASE WHEN $2 THEN now() ELSE rsvp_confirmation_sent_at END,
           rsvp_confirmation_claimed_at=NULL
       WHERE id=$1 AND rsvp_confirmation_attempt_key=$3::uuid`,
      [submission.id, sent, submission.rsvp_confirmation_attempt_key],
    )
    return { sent }
  }

  app.get('/api/admin/registrations-without-response', async (request, reply) => {
    requireSuperadmin(request)
    const parsed = z.object({ search: z.string().trim().max(150).default(''), page: z.coerce.number().int().min(1).default(1), export: z.enum(['csv']).optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid registration-list filters.' })
    const { search, page, export: format } = parsed.data
    // Registration has always been stored separately from event responses.
    // Read existing accounts directly; never manufacture an event/attendance
    // record from an account creation email or current verification status.
    const where = `WHERE NOT u.is_demo AND NOT u.is_superadmin
      AND NOT EXISTS (SELECT 1 FROM offer_interest_submissions s WHERE s.user_id=u.id)
      AND ($1::text='' OR position(lower($1) in lower(concat_ws(' ',u.first_name,u.last_name,u.personal_email,u.work_email)))>0)`
    const result = await db.query(
      `SELECT u.id,concat_ws(' ',u.first_name,u.last_name) full_name,COALESCE(u.work_email,u.personal_email) email,
        u.city,u.educator_verified_at IS NOT NULL is_verified,u.created_at registered_at
       FROM users u ${where} ORDER BY u.created_at DESC,u.id ${format ? '' : 'LIMIT 100 OFFSET $2'}`,
      format ? [search] : [search, (page - 1) * 100],
    )
    if (format) {
      const lines = [['Name', 'School / account email', 'City', 'Educator eligibility', 'Event response', 'Registration date'].map(csvCell).join(',')]
      for (const row of result.rows) lines.push([row.full_name,row.email,row.city,row.is_verified ? 'Verified' : 'Not verified','Registered only',new Date(row.registered_at).toISOString()].map(csvCell).join(','))
      return reply.header('Content-Disposition', 'attachment; filename="registered-only.csv"').header('Cache-Control', 'no-store').type('text/csv; charset=utf-8').send('\uFEFF' + lines.join('\r\n'))
    }
    const totals = await db.query(`SELECT count(*)::int members FROM users u ${where}`, [search])
    return reply.header('Cache-Control', 'no-store').send({ registrations: result.rows, totals: totals.rows[0], page, pageSize: 100 })
  })

  app.post('/api/deals/:id/interest', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const user = requireVerified(request)
    const params = z.object({ id: z.string().min(1).max(100) }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid offer ID.' })
    const id = params.data.id
    const eligible = await db.query(
      `SELECT d.id,d.event_date_time,d.event_location FROM deals d JOIN businesses b ON b.id=d.business_id
       WHERE d.id=$1 AND d.cta_type<>'use_deal' AND d.published AND b.published
       AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())`, [id],
    )
    if (!eligible.rows.length) return reply.code(404).send({ error: 'This interest offer is not available.' })
    const inserted = await db.query(
      `INSERT INTO offer_interest_submissions(id,user_id,deal_id,business_id,cta_type,member_id,full_name,email,business_name,event_name)
       SELECT $1,u.id,d.id,b.id,d.cta_type,c.member_id,concat_ws(' ',u.first_name,u.last_name),COALESCE(u.offers_email,u.work_email,u.personal_email),b.name,COALESCE(NULLIF(d.event_name,''),d.title)
       FROM users u JOIN member_cards c ON c.user_id=u.id AND c.status='active'
       CROSS JOIN deals d JOIN businesses b ON b.id=d.business_id
       WHERE u.id=$2 AND u.educator_verified_at IS NOT NULL AND d.id=$3 AND d.cta_type<>'use_deal' AND d.published AND b.published
       AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())
       ON CONFLICT(user_id,deal_id) DO UPDATE SET cta_type=EXCLUDED.cta_type,member_id=EXCLUDED.member_id,full_name=EXCLUDED.full_name,email=EXCLUDED.email,business_name=EXCLUDED.business_name,event_name=EXCLUDED.event_name,submitted_at=now()
       WHERE EXCLUDED.cta_type='rsvp' AND offer_interest_submissions.cta_type<>'rsvp'
       RETURNING id,submitted_at,cta_type,email,event_name,business_name,deal_id,rsvp_confirmation_sent_at`, [randomUUID(), user.id, id],
    )
    const existing = inserted.rows[0] ?? (await db.query(
      `SELECT id,submitted_at,cta_type,email,event_name,business_name,deal_id,rsvp_confirmation_sent_at
       FROM offer_interest_submissions WHERE user_id=$1 AND deal_id=$2`, [user.id, id],
    )).rows[0]
    if (!existing) return reply.code(403).send({ error: 'An active verified membership is required to register interest.' })
    const delivery = existing.cta_type === 'rsvp'
      ? existing.rsvp_confirmation_sent_at
        ? { sent: true }
        : await deliverRsvpConfirmation(existing.id, user.id, false)
      : { sent: false }
    const confirmationEmailSent = delivery.sent
    return reply.code(inserted.rows.length ? 201 : 200).send({ submission: { id: existing.id, submitted_at: existing.submitted_at }, alreadySubmitted: !inserted.rows.length, confirmationEmailSent })
  })

  app.post('/api/me/rsvps/:id/confirmation', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (request, reply) => {
    const user = requireVerified(request)
    const params = z.object({ id: z.uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid RSVP link.' })
    const result = await deliverRsvpConfirmation(params.data.id, user.id, true)
    if (result.sent) return reply.header('Cache-Control', 'no-store').send({ sent: true })
    if (result.notFound) return reply.code(404).send({ error: 'No active RSVP was found for this account.' })
    if (result.throttled) return reply.code(429).send({ error: 'Please wait a minute before requesting another confirmation email.' })
    return reply.code(503).send({ error: 'Your RSVP is saved, but we could not send the confirmation email. Please try again shortly.' })
  })

  app.get('/api/me/rsvps/:id', async (request, reply) => {
    const user = requireVerified(request)
    const params = z.object({ id: z.uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid RSVP link.' })
    const result = await db.query(`SELECT s.id,s.deal_id,s.event_name,s.business_name,d.event_date_time,d.event_location
      FROM offer_interest_submissions s JOIN deals d ON d.id=s.deal_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.cta_type='rsvp'`, [params.data.id, user.id])
    if (!result.rows[0]) return reply.code(404).send({ error: 'No active RSVP was found for this account. It may already have been cancelled.' })
    return reply.header('Cache-Control', 'no-store').send({ rsvp: result.rows[0] })
  })
  app.delete('/api/me/rsvps/:id', async (request, reply) => {
    const user = requireVerified(request)
    const params = z.object({ id: z.uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid RSVP link.' })
    await db.query("DELETE FROM offer_interest_submissions WHERE id=$1 AND user_id=$2 AND cta_type='rsvp'", [params.data.id, user.id])
    return reply.header('Cache-Control', 'no-store').send({ ok: true })
  })

  app.get('/api/admin/offer-interests', async (request, reply) => {
    requireSuperadmin(request)
    const parsed = z.object({ dealId: z.string().max(100).optional(), businessId: z.string().max(100).optional(), ctaType: z.enum(['join_waitlist', 'rsvp', 'get_launch_invite']).optional(), scope: z.enum(['events']).optional(), page: z.coerce.number().int().min(1).default(1), export: z.enum(['csv']).optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid interest-list filters.' })
    const { dealId, businessId, ctaType, scope, page, export: format } = parsed.data
    const filter = dealId || null
    const filters = [filter, businessId || null, ctaType || null]
    // Older event signups can be stored as waitlists. Read their original
    // responses too, without relabelling them as confirmed attendance or
    // requiring the event/account to still be published, active or verified.
    // Keep rows, totals, offer counts and CSV on the same historical scope.
    const eventResponseTypes = "'rsvp','get_launch_invite','join_waitlist'"
    const where = `WHERE ($1::text IS NULL OR deal_id=$1) AND ($2::text IS NULL OR business_id=$2) AND ($3::text IS NULL OR cta_type=$3)${scope === 'events' ? ` AND cta_type IN (${eventResponseTypes})` : ''}`
    const submissions = await db.query(
      `SELECT s.id,s.deal_id,s.cta_type,s.member_id,s.full_name,s.email,u.work_email verified_school_email,s.business_name,s.event_name,s.submitted_at
       FROM offer_interest_submissions s LEFT JOIN users u ON u.id=s.user_id
       ${where} ORDER BY s.submitted_at DESC,s.id
       ${format ? '' : 'LIMIT 100 OFFSET $4'}`, format ? filters : [...filters, (page - 1) * 100],
    )
    if (format) {
      const lines = [(scope === 'events'
        ? ['Member ID', 'Name', 'RSVP contact email', 'Verified school email', 'Business', 'Event', 'Response', 'Submission date']
        : ['Member ID', 'Name', 'Email', 'Business', 'Event', 'CTA type', 'Submission date'])
        .map(csvCell).join(',')]
      const labels = scope === 'events' ? OFFER_RESPONSE_LABELS : OFFER_CTA_LABELS
      for (const row of submissions.rows) lines.push((scope === 'events'
        ? [row.member_id, row.full_name, row.email, row.verified_school_email || 'Not on file', row.business_name, row.event_name, labels[row.cta_type as OfferCtaType], new Date(row.submitted_at).toISOString()]
        : [row.member_id, row.full_name, row.email, row.business_name, row.event_name, labels[row.cta_type as OfferCtaType], new Date(row.submitted_at).toISOString()])
        .map(csvCell).join(','))
      return reply.header('Content-Disposition', `attachment; filename="${scope === 'events' ? 'event-rsvps' : 'interested-educators'}.csv"`).header('Cache-Control', 'no-store').type('text/csv; charset=utf-8').send('\uFEFF' + lines.join('\r\n'))
    }
    const [totals, offers] = await Promise.all([
      db.query(`SELECT count(*)::int submissions,count(DISTINCT user_id)::int educators FROM offer_interest_submissions ${where}`, filters),
      db.query(`SELECT d.id,d.title,d.event_name,d.cta_type,b.id business_id,b.name business_name,count(s.id)::int interested
                FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN offer_interest_submissions s ON s.deal_id=d.id AND ($1::text IS NULL OR s.cta_type=$1)${scope === 'events' ? ` AND s.cta_type IN (${eventResponseTypes})` : ''}
                WHERE ${scope === 'events' ? `(d.cta_type IN (${eventResponseTypes}) OR s.id IS NOT NULL)` : "(($1::text IS NULL AND d.cta_type<>'use_deal') OR d.cta_type=$1 OR s.id IS NOT NULL)"} GROUP BY d.id,b.id ORDER BY d.created_at DESC`, [ctaType || null]),
    ])
    return reply.header('Cache-Control', 'no-store').send({ submissions: submissions.rows, totals: totals.rows[0], offers: offers.rows, page, pageSize: 100 })
  })
}
