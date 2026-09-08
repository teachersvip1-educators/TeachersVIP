import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { getConfig } from './config'
import { createPool } from './db/pool'

const databaseUrl = process.env.TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip

suite('TeachersVIP educator verification and activation API', () => {
  const suffix = randomUUID().slice(0, 8)
  const personalEmail = `teacher-${suffix}@gmail.com`
  const staffDomain = `staff-${suffix}.example.edu`
  const staffEmail = `professor@${staffDomain}`
  const config = getConfig({
    NODE_ENV: 'development', DATABASE_URL: databaseUrl ?? 'postgresql://test:test@localhost:5432/teachersvip_test',
    APP_URL: 'http://localhost:8443', SESSION_SECRET: 'integration-test-session-secret-32-characters',
    DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined, EDUCATOR_ONLY_VERIFICATION: true,
  })
  const db = createPool(config)
  const app = buildApp({ config, db })

  beforeAll(async () => {
    await app.ready()
    await db.query(`INSERT INTO educator_domains(id,normalized_domain,registrable_domain,classification,eligible_role,decision,evidence,evidence_url,reviewed_at)
      VALUES($1,$2,'example.edu','staff_only','College professor','auto_eligible','Integration-test staff-only evidence.','https://example.edu/faculty',now())`, [randomUUID(), staffDomain])
  })

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE personal_email=ANY($1::citext[])', [[personalEmail, staffEmail]])
    await db.query('DELETE FROM educator_domains WHERE normalized_domain=$1', [staffDomain])
    await app.close()
    await db.end()
  })

  async function register(email: string, role: 'K-12 educator' | 'College professor') {
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Test', lastName: 'Educator', schoolEmail: email, role, roleAttestation: true, city: 'Houston, Texas', password: 'Eight123', smsConsent: false } })
    expect(response.statusCode).toBe(201)
    return { cookie: String(response.headers['set-cookie']).split(';')[0], token: new URL(response.json().verificationUrl).searchParams.get('token') }
  }

  it('routes a confirmed personal email to manual review without issuing a card', async () => {
    const { cookie, token } = await register(personalEmail, 'K-12 educator')
    const confirmed = await app.inject({ method: 'POST', url: '/api/verification/confirm', headers: { cookie }, payload: { token } })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toMatchObject({ status: 'manual_review' })
    const card = await app.inject({ method: 'GET', url: '/api/me/vip-card', headers: { cookie } })
    expect(card.statusCode).toBe(403)
  })

  it('automatically approves only a reviewed staff-only role match and uses controlled online activation', async () => {
    const { cookie, token } = await register(staffEmail, 'College professor')
    const confirmed = await app.inject({ method: 'POST', url: '/api/verification/confirm', headers: { cookie }, payload: { token } })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toMatchObject({ status: 'verified', walletStatus: 'not_configured' })

    const activated = await app.inject({ method: 'POST', url: '/api/deals/teacher-tech-25/activate', headers: { cookie }, payload: { idempotencyKey: randomUUID() } })
    expect(activated.statusCode).toBe(200)
    expect(activated.json()).toMatchObject({ activationType: 'online_offer_access', redemptionMethod: 'coupon_code', redemptionValue: 'EDUCATOR25' })

    const legacyReport = await app.inject({ method: 'POST', url: '/api/deals/teacher-tech-25/report-use', headers: { cookie }, payload: { idempotencyKey: randomUUID() } })
    expect(legacyReport.statusCode).toBe(410)

    const profile = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(profile.json().profile).toMatchObject({ educator_verified_at: expect.any(String), reported_uses: 1 })
  })
})
