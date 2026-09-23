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
  const creatorEmail = `creator-${suffix}@example.test`
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
    await db.query('DELETE FROM creator_network_submissions WHERE educator_email=ANY($1::citext[])', [[creatorEmail, staffEmail]])
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
    expect(profile.json().profile).toMatchObject({ educator_verified_at: expect.any(String), activation_count: 1 })

    const publicCreator = await app.inject({
      method: 'POST', url: '/api/creator-network', payload: {
        fullName: 'Public Creator', city: 'Austin', educatorEmail: creatorEmail,
        contactInformation: '555 0100', socialHandles: '@publiccreator', platforms: ['Instagram'],
        followerRange: '1,000–4,999', contentNiches: ['Education'], sampleContent: 'https://example.test/sample',
        opportunityInterests: ['Paid content'], contactConsent: true,
      },
    })
    expect(publicCreator.statusCode).toBe(202)
    expect(publicCreator.json()).toMatchObject({ accepted: false, emailVerificationRequired: true })
    const creatorToken = new URL(publicCreator.json().verificationUrl).searchParams.get('verify')
    const pendingCreator = await db.query<{ email_verified_at: Date | null }>('SELECT email_verified_at FROM creator_network_submissions WHERE educator_email=$1', [creatorEmail])
    expect(pendingCreator.rows[0]?.email_verified_at).toBeNull()

    const throttledCreator = await app.inject({
      method: 'POST', url: '/api/creator-network', payload: {
        fullName: 'Public Creator', city: 'Austin', educatorEmail: creatorEmail,
        contactInformation: '555 0100', socialHandles: '@publiccreator', platforms: ['Instagram'],
        followerRange: '1,000–4,999', contentNiches: ['Education'], sampleContent: 'https://example.test/sample',
        opportunityInterests: ['Paid content'], contactConsent: true,
      },
    })
    expect(throttledCreator.statusCode).toBe(429)

    const confirmedCreator = await app.inject({ method: 'POST', url: '/api/creator-network/verify', payload: { token: creatorToken } })
    expect(confirmedCreator.statusCode).toBe(200)
    const acceptedCreator = await db.query<{ email_verified_at: Date | null }>('SELECT email_verified_at FROM creator_network_submissions WHERE educator_email=$1', [creatorEmail])
    expect(acceptedCreator.rows[0]?.email_verified_at).toBeTruthy()

    const memberCreator = await app.inject({
      method: 'POST', url: '/api/creator-network', headers: { cookie }, payload: {
        fullName: 'Verified Creator', city: 'Houston', educatorEmail: staffEmail,
        contactInformation: '555 0101', socialHandles: '@verifiedcreator', platforms: ['YouTube'],
        followerRange: '5,000–24,999', contentNiches: ['Teacher life'], sampleContent: 'https://example.test/verified',
        opportunityInterests: ['Promotions'], contactConsent: true,
      },
    })
    expect(memberCreator.statusCode).toBe(201)
    expect(memberCreator.json()).toMatchObject({ accepted: true, emailVerificationRequired: false })

    const unrelatedOfferReview = await app.inject({ method: 'POST', url: '/api/businesses/teacher-tech/reviews', headers: { cookie }, payload: { rating: 5, reviewText: 'This should need its own offer activation.', dealId: 'teacher-tech-giveaway' } })
    expect(unrelatedOfferReview.statusCode).toBe(403)
    const submittedReview = await app.inject({
      method: 'POST', url: '/api/businesses/teacher-tech/reviews', headers: { cookie },
      payload: { rating: 5, reviewText: 'The redemption instructions were clear and easy to use.', dealId: 'teacher-tech-25' },
    })
    expect(submittedReview.statusCode).toBe(201)
    const hiddenReviews = await app.inject({ method: 'GET', url: '/api/business-reviews' })
    expect(hiddenReviews.json().reviews).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: submittedReview.json().reviewId })]))
    await db.query("UPDATE business_reviews SET status='approved' WHERE id=$1", [submittedReview.json().reviewId])
    const publishedReviews = await app.inject({ method: 'GET', url: '/api/business-reviews' })
    expect(publishedReviews.json().reviews).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: submittedReview.json().reviewId, business_name: 'Sunday Supply', rating: 5 }),
    ]))
  })
})
