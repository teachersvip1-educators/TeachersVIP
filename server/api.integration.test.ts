import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app'
import { getConfig } from './config'
import { createPool } from './db/pool'

const databaseUrl = process.env.TEST_DATABASE_URL
const suite = databaseUrl ? describe : describe.skip

suite('V1 API integration', () => {
  const email = `teacher-${randomUUID()}@gmail.com`
  const config = getConfig({
    NODE_ENV: 'development', DATABASE_URL: databaseUrl ?? 'postgresql://test:test@localhost:5432/teachersvip_test',
    APP_URL: 'http://localhost:8443', SESSION_SECRET: 'integration-test-session-secret-32-characters',
    DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined,
  })
  const db = createPool(config)
  const app = buildApp({ config, db })
  let cookie = ''

  beforeAll(async () => { await app.ready() })
  afterAll(async () => {
    await db.query('DELETE FROM users WHERE personal_email=$1', [email])
    await app.close()
    await db.end()
  })

  it('completes registration, unrestricted email verification, protected promo reveal, and reporting', async () => {
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { firstName: 'Test', lastName: 'Teacher', schoolEmail: email, city: 'Houston, Texas', password: 'TeachersVIP-Test-2026', smsConsent: true } })
    expect(registration.statusCode).toBe(201)
    cookie = String(registration.headers['set-cookie']).split(';')[0]

    const verification = await app.inject({ method: 'POST', url: '/api/verification/send', headers: { cookie }, payload: {} })
    expect(verification.statusCode).toBe(200)
    const token = new URL(verification.json().verificationUrl).searchParams.get('token')
    expect(token).toBeTruthy()

    const confirmed = await app.inject({ method: 'POST', url: '/api/verification/confirm', headers: { cookie }, payload: { token } })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.headers['set-cookie']).toContain('teachersvip_session=')

    const reveal = await app.inject({ method: 'POST', url: '/api/deals/teacher-tech-25/reveal-code', headers: { cookie } })
    expect(reveal.json()).toEqual({ promoCode: 'EDUCATOR25' })

    const reported = await app.inject({ method: 'POST', url: '/api/deals/teacher-tech-25/report-use', headers: { cookie }, payload: { idempotencyKey: randomUUID() } })
    expect(reported.statusCode).toBe(200)

    const profile = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(profile.json().profile).toMatchObject({ educator_verified_at: expect.any(String), estimated_savings_cents: 2500, reported_uses: 1 })
  })
})
