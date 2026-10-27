import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getConfig } from './config.js'
import type { DbPool } from './db/pool.js'

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
