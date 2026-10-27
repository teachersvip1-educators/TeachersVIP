import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app'
import { getConfig } from './config'
import type { DbPool } from './db/pool'

const apps: ReturnType<typeof buildApp>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })

function setup(demo = false) {
  const member = { id: 'member', personal_email: 'school@district.edu', work_email: 'school@district.edu', offers_email: 'personal@example.test', is_demo: demo, first_name: 'Test', last_name: 'Member', city: 'Houston, Texas', educator_verified_at: demo ? null : new Date().toISOString(), is_superadmin: false }
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM sessions s') ? [member] : [] }))
  const config = getConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://unused/test', APP_URL: 'http://localhost:8443', SESSION_SECRET: 'test-session-secret-that-is-long-enough', DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined, SUPERADMIN_EMAILS: demo ? member.personal_email : '' })
  const app = buildApp({ config, db: { query } as unknown as DbPool }); apps.push(app)
  return { app, query }
}
const headers = { cookie: 'teachersvip_session=test-session' }
const profile = { firstName: 'Test', lastName: 'Member', mobile: null, city: 'Houston, TX', smsConsent: false, emailUpdates: true }

describe('member delivery preference', () => {
  it('saves a personal offers email without changing login or verified work email', async () => {
    const { app, query } = setup()
    const response = await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { ...profile, offersEmail: 'Personal@Example.test' } })
    expect(response.statusCode).toBe(200)
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE users')) as unknown as [string, unknown[]]
    expect(update[0]).not.toMatch(/SET personal_email|work_email=/)
    expect(update[1]).toEqual(['Test', 'Member', null, 'Houston, Texas', false, true, 'member', 'personal@example.test'])
  })
  it('allows returning delivery to the work email', async () => {
    const { app, query } = setup()
    const response = await app.inject({ method: 'PATCH', url: '/api/me', headers, payload: { ...profile, offersEmail: null } })
    expect(response.statusCode).toBe(200)
    expect((query.mock.calls.find(([sql]) => sql.includes('UPDATE users')) as unknown as [string, unknown[]])[1][7]).toBeNull()
  })
  it.each([{ ...profile, offersEmail: 'invalid' }, { ...profile, city: 'Toronto, Ontario' }])('rejects invalid email or non-US city', async payload => {
    const { app, query } = setup()
    expect((await app.inject({ method: 'PATCH', url: '/api/me', headers, payload })).statusCode).toBe(400)
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE users'))).toBe(false)
  })
})

describe('investor preview boundary', () => {
  it('acknowledges preview telemetry without recording real member activity', async () => {
    const { app, query } = setup(true)
    expect((await app.inject({ method: 'POST', url: '/api/analytics/events', headers, payload: { eventType: 'deal_view', dealId: 'example' } })).statusCode).toBe(200)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO analytics_events'))).toBe(false)
  })
  it('keeps the preview unverified and excludes configured admin overrides', async () => {
    const { app } = setup(true)
    const response = await app.inject({ method: 'GET', url: '/api/auth/session', headers })
    expect(response.json().user).toMatchObject({ is_demo: true, verified: false, is_superadmin: false })
  })
  it.each([
    ['POST', '/api/deals/event/interest'], ['POST', '/api/deals/offer/activate'],
    ['POST', '/api/deals/offer/save'], ['PATCH', '/api/me'],
    ['POST', '/api/verification/send'], ['POST', '/api/auth/admin-register'],
  ] as const)('blocks %s %s before writing data', async (method, url) => {
    const { app, query } = setup(true)
    const response = await app.inject({ method, url, headers, payload: {} })
    expect(response.statusCode).toBe(403)
    expect(response.json().error).toContain('read-only')
    expect(query).toHaveBeenCalledTimes(1)
  })
  it.each(['/api/me/vip-card', '/api/admin/overview'])('blocks privileged read %s', async url => {
    const { app } = setup(true)
    expect((await app.inject({ method: 'GET', url, headers })).statusCode).toBe(403)
  })
  it('allows browsing published offers and signing out', async () => {
    const { app, query } = setup(true)
    expect((await app.inject({ method: 'GET', url: '/api/deals', headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/api/auth/sign-out', headers })).statusCode).toBe(200)
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE sessions SET revoked_at'))).toBe(true)
  })
})
