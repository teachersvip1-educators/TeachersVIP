import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { DbPool } from '../db/pool.js'
import { OFFER_CTA_LABELS, type OfferCtaType } from '../../shared/offer-cta.js'

export function csvCell(value: unknown): string {
  const text = String(value ?? '')
  // Spreadsheet exports must not execute educator-supplied names as formulas.
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

type Authorize = (request: FastifyRequest) => { id: string }

export function registerOfferInterestRoutes(app: FastifyInstance, db: DbPool, requireVerified: Authorize, requireSuperadmin: Authorize) {
  app.post('/api/deals/:id/interest', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const user = requireVerified(request)
    const params = z.object({ id: z.string().min(1).max(100) }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Invalid offer ID.' })
    const id = params.data.id
    const eligible = await db.query(
      `SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id
       WHERE d.id=$1 AND d.cta_type<>'use_deal' AND d.published AND b.published
       AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())`, [id],
    )
    if (!eligible.rows.length) return reply.code(404).send({ error: 'This interest offer is not available.' })
    const inserted = await db.query(
      `INSERT INTO offer_interest_submissions(id,user_id,deal_id,business_id,cta_type,member_id,full_name,email,business_name,event_name)
       SELECT $1,u.id,d.id,b.id,d.cta_type,c.member_id,concat_ws(' ',u.first_name,u.last_name),COALESCE(u.work_email,u.personal_email),b.name,COALESCE(NULLIF(d.event_name,''),d.title)
       FROM users u JOIN member_cards c ON c.user_id=u.id AND c.status='active'
       CROSS JOIN deals d JOIN businesses b ON b.id=d.business_id
       WHERE u.id=$2 AND u.educator_verified_at IS NOT NULL AND d.id=$3 AND d.cta_type<>'use_deal' AND d.published AND b.published
       AND (d.starts_at IS NULL OR d.starts_at<=now()) AND (d.ends_at IS NULL OR d.ends_at>now())
       ON CONFLICT(user_id,deal_id) DO NOTHING RETURNING id,submitted_at`, [randomUUID(), user.id, id],
    )
    const existing = inserted.rows[0] ?? (await db.query(
      'SELECT id,submitted_at FROM offer_interest_submissions WHERE user_id=$1 AND deal_id=$2', [user.id, id],
    )).rows[0]
    if (!existing) return reply.code(403).send({ error: 'An active verified membership is required to register interest.' })
    return reply.code(inserted.rows.length ? 201 : 200).send({ submission: existing, alreadySubmitted: !inserted.rows.length })
  })

  app.get('/api/admin/offer-interests', async (request, reply) => {
    requireSuperadmin(request)
    const parsed = z.object({ dealId: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1), export: z.enum(['csv']).optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid interest-list filters.' })
    const { dealId, page, export: format } = parsed.data
    const filter = dealId || null
    const submissions = await db.query(
      `SELECT id,deal_id,cta_type,member_id,full_name,email,business_name,event_name,submitted_at FROM offer_interest_submissions
       WHERE ($1::text IS NULL OR deal_id=$1) ORDER BY submitted_at DESC,id
       ${format ? '' : 'LIMIT 100 OFFSET $2'}`, format ? [filter] : [filter, (page - 1) * 100],
    )
    if (format) {
      const lines = [['Member ID', 'Name', 'Email', 'Business', 'Event', 'CTA type', 'Submission date'].map(csvCell).join(',')]
      for (const row of submissions.rows) lines.push([row.member_id, row.full_name, row.email, row.business_name, row.event_name, OFFER_CTA_LABELS[row.cta_type as OfferCtaType], new Date(row.submitted_at).toISOString()].map(csvCell).join(','))
      return reply.header('Content-Disposition', 'attachment; filename="interested-educators.csv"').header('Cache-Control', 'no-store').type('text/csv; charset=utf-8').send('\uFEFF' + lines.join('\r\n'))
    }
    const [totals, offers] = await Promise.all([
      db.query('SELECT count(*)::int submissions,count(DISTINCT user_id)::int educators FROM offer_interest_submissions WHERE ($1::text IS NULL OR deal_id=$1)', [filter]),
      db.query(`SELECT d.id,d.title,d.event_name,d.cta_type,b.name business_name,count(s.id)::int interested
                FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN offer_interest_submissions s ON s.deal_id=d.id
                WHERE d.cta_type<>'use_deal' OR s.id IS NOT NULL GROUP BY d.id,b.id ORDER BY d.created_at DESC`),
    ])
    return reply.header('Cache-Control', 'no-store').send({ submissions: submissions.rows, totals: totals.rows[0], offers: offers.rows, page, pageSize: 100 })
  })
}
