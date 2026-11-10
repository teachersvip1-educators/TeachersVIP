import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getConfig } from './config.js'
import type { DbPool } from './db/pool.js'
import { tokenHash } from './security.js'

const apps: FastifyInstance[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()))
  vi.unstubAllEnvs()
})

function setup(email: string, evidence: Record<string, unknown> | null, validToken = true) {
  // A leftover deployment setting must never restore the former pilot bypass.
  vi.stubEnv('EDUCATOR_ONLY_VERIFICATION', 'false')
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT id,user_id,work_email,selected_role')) return { rows: validToken ? [{ id: 'case-1', user_id: 'educator-1', work_email: email, selected_role: 'K-12 educator', normalized_domain: email.split('@')[1], status: 'email_pending' }] : [] }
    if (sql.includes('FROM educator_domains')) return { rows: evidence ? [evidence] : [] }
    return { rows: [] }
  })
  const client = { query, release: vi.fn() }
  const db = { query: vi.fn().mockResolvedValue({ rows: [] }), connect: vi.fn().mockResolvedValue(client) } as unknown as DbPool
  const config = getConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://unused/test', APP_URL: 'https://teachers.example', SESSION_SECRET: 'test-session-secret-that-is-long-enough', DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined, PASS2U_API_KEY: undefined, PASS2U_MODEL_ID: undefined })
  const app = buildApp({ config, db }); apps.push(app)
  return { app, query }
}

const reviewed = { id: 'domain-1', institution_id: null, normalizedDomain: 'district.edu', registrableDomain: 'district.edu', classification: 'staff_only', decision: 'auto_eligible', eligibleRole: 'K-12 educator', evidence: 'Reviewed district staff-only email policy.', reviewedAt: new Date() }

describe('educator-only email confirmation', () => {
  it.each([
    ['personal provider', 'teacher@gmail.com', reviewed],
    ['unknown domain', 'teacher@unknown.edu', null],
    ['shared student domain', 'teacher@district.edu', { ...reviewed, classification: 'shared_staff_student' }],
    ['wrong role', 'teacher@district.edu', { ...reviewed, eligibleRole: 'College professor' }],
  ])('keeps a %s in review even with the old pilot flag set to false', async (_label, email, evidence) => {
    const { app, query } = setup(email, evidence)
    const response = await app.inject({ method: 'POST', url: '/api/verification/confirm', payload: { token: 'test-email-confirmation-token' } })
    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('manual_review')
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO member_cards'))).toBe(false)
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET work_email'), [email, 'manual_review', 'educator-1'])
  })

  it('issues membership after a reviewed staff-only domain and role match', async () => {
    const { app, query } = setup('teacher@district.edu', reviewed)
    const response = await app.inject({ method: 'POST', url: '/api/verification/confirm', payload: { token: 'test-email-confirmation-token' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: 'verified', walletStatus: 'not_configured' })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO member_cards'), expect.any(Array))
  })

  it('rejects an expired or consumed link without approving eligibility', async () => {
    const { app, query } = setup('teacher@district.edu', reviewed, false)
    const response = await app.inject({ method: 'POST', url: '/api/verification/confirm', payload: { token: 'test-email-confirmation-token' } })
    expect(response.statusCode).toBe(400)
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE users') || sql.includes('INSERT INTO member_cards'))).toBe(false)
  })
})

describe('automatic re-evaluation of pending educator cases', () => {
  const database = new PGlite({ extensions: { citext } })
  const query = database.query.bind(database)
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DbPool
  const config = getConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused/test', SESSION_SECRET: 'test-session-secret-that-is-long-enough',
    DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined, PASS2U_API_KEY: undefined,
  })
  const app = buildApp({ config, db: pool })

  beforeAll(async () => {
    const migrations = new URL('./db/migrations/', import.meta.url)
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort())
      await database.exec(await readFile(new URL(name, migrations), 'utf8'))
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await database.close()
  })

  async function pendingSession(email: string, role = 'K-12 educator') {
    const userId = randomUUID()
    const caseId = randomUUID()
    const token = randomUUID()
    await query(
      `INSERT INTO users(id,personal_email,password_hash,first_name,last_name,city)
       VALUES($1,$2,'test-only','Test','Educator','Houston, Texas')`, [userId, email],
    )
    await query(
      `INSERT INTO educator_verification_cases(id,user_id,work_email,selected_role,normalized_domain,status,email_verified_at)
       VALUES($1,$2,$3,$4,$5,'manual_review',now())`,
      [caseId, userId, email, role, email.split('@')[1]],
    )
    await query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [randomUUID(), userId, tokenHash(token)],
    )
    return {
      caseId,
      userId,
      session: () => app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: `teachersvip_session=${token}` } }),
    }
  }

  async function reviewDomain(domain: string, registrableDomain: string) {
    const id = randomUUID()
    await query(
      `INSERT INTO educator_domains(id,normalized_domain,registrable_domain,classification,eligible_role,decision,evidence,reviewed_at)
       VALUES($1,$2,$3,'staff_only','K-12 educator','auto_eligible','Fixture staff-only policy',now())`,
      [id, domain, registrableDomain],
    )
    return id
  }

  it('approves an existing confirmed case after its domain review and records membership once', async () => {
    const email = 'teacher@staff.review-fixture.edu'
    const { caseId, userId, session } = await pendingSession(email)
    expect((await session()).json().user).toMatchObject({ verified: false, verification_status: 'manual_review' })
    const domainId = await reviewDomain('staff.review-fixture.edu', 'review-fixture.edu')

    const response = await session()
    expect(response.statusCode, response.body).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.json().user).toMatchObject({ work_email: email, verified: true, verification_status: 'verified' })
    expect((await session()).json().user.verified).toBe(true)

    const { rows } = await query(
      `SELECT c.status,c.domain_id,m.status member_status,a.event_type
       FROM educator_verification_cases c JOIN member_cards m ON m.user_id=c.user_id
       JOIN educator_verification_audits a ON a.case_id=c.id
       WHERE c.id=$1 AND c.user_id=$2`, [caseId, userId],
    )
    expect(rows).toEqual([{ status: 'verified', domain_id: domainId, member_status: 'active', event_type: 'auto_eligible' }])
  })

  it('keeps unmatched roles and domains, and the latest unconfirmed case, in review', async () => {
    await reviewDomain('staff.boundary-fixture.edu', 'boundary-fixture.edu')
    const sibling = await pendingSession('teacher@other.boundary-fixture.edu')
    const wrongRole = await pendingSession('professor@staff.boundary-fixture.edu', 'College professor')
    const superseded = await pendingSession('teacher@staff.boundary-fixture.edu')
    await query(
      `INSERT INTO educator_verification_cases(id,user_id,work_email,selected_role,normalized_domain,status,created_at)
       VALUES($1,$2,'new@staff.boundary-fixture.edu','K-12 educator','staff.boundary-fixture.edu','manual_review',now()+interval '1 second')`,
      [randomUUID(), superseded.userId],
    )

    for (const fixture of [sibling, wrongRole, superseded]) {
      const response = await fixture.session()
      expect(response.statusCode, response.body).toBe(200)
      expect(response.json().user).toMatchObject({ verified: false, verification_status: 'manual_review' })
      expect((await query('SELECT id FROM member_cards WHERE user_id=$1', [fixture.userId])).rows).toEqual([])
    }
  })
})
