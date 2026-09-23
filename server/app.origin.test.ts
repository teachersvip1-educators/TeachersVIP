import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { getConfig } from './config.js'
import type { DbPool } from './db/pool.js'

const config = getConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  APP_URL: 'https://canonical.example.com',
  SESSION_SECRET: 'test-session-secret-that-is-long-enough',
  DATA_ENCRYPTION_KEY: '0'.repeat(64),
})

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function createApp() {
  const db = { query: vi.fn() } as unknown as DbPool
  app = buildApp({ config, db })
  return app
}

describe('production request origin protection', () => {
  it('keeps member feedback and launch analytics behind their roles', async () => {
    const target = createApp()
    for (const [method, url, payload] of [
      ['POST', '/api/business-suggestions', { businessName: 'Example Shop', city: 'Humble' }],
      ['POST', '/api/deals/example/issue-reports', { reason: 'expired' }],
      ['POST', '/api/business-reviews/00000000-0000-4000-8000-000000000000/reports', { reason: 'spam' }],
      ['GET', '/api/admin/launch-analytics', undefined],
      ['GET', '/api/admin/launch-feedback', undefined],
    ] as const) {
      const response = await target.inject({ method, url, headers: { origin: 'https://canonical.example.com' }, ...(payload ? { payload } : {}) })
      expect(response.statusCode).toBe(401)
    }
  })

  it('allows the configured remote deal-image host in production', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-security-policy']).toContain("img-src 'self' data: https://images.unsplash.com")
  })

  it('does not report readiness when the launch tables are missing', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ ready: false }] }) } as unknown as DbPool
    app = buildApp({ config, db })
    const response = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(response.statusCode).toBe(503)
  })

  it('accepts the public same-origin host forwarded by Railway', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: {
        origin: 'https://teachersvip-production.up.railway.app',
        'x-forwarded-host': 'teachersvip-production.up.railway.app',
        'x-forwarded-proto': 'https',
      },
      payload: {},
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).not.toBe('Request origin is not allowed.')
  })

  it('rejects a different website origin', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: {
        origin: 'https://malicious.example',
        'x-forwarded-host': 'teachersvip-production.up.railway.app',
        'x-forwarded-proto': 'https',
      },
      payload: {},
    })
    expect(response.statusCode).toBe(403)
  })

  it('returns a field-specific registration validation message', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: 'https://canonical.example.com' },
      payload: { firstName: 'A', lastName: 'Teacher', schoolEmail: 'teacher@example.com', city: 'Houston, Texas', password: 'long-enough-password' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'First name must contain at least 2 characters.' })
  })

  it('fails closed when production email confirmation is not configured', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { origin: 'https://canonical.example.com' },
      payload: {
        firstName: 'Taylor', lastName: 'Teacher', schoolEmail: 'taylor@example.edu',
        city: 'Houston, Texas', password: 'long-enough-password', role: 'K-12 educator',
        roleAttestation: true, smsConsent: false,
      },
    })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: 'Email confirmation is temporarily unavailable. Please try again later.',
    })
  })

  it('does not create a public Creator Network verification path without production email delivery', async () => {
    const response = await createApp().inject({
      method: 'POST',
      url: '/api/creator-network',
      headers: { origin: 'https://canonical.example.com' },
      payload: {
        fullName: 'Taylor Creator', city: 'Austin', educatorEmail: 'taylor@example.edu',
        contactInformation: '555 0100', socialHandles: '@taylor', platforms: ['Instagram'],
        followerRange: '1,000–4,999', contentNiches: ['Education'], sampleContent: 'https://example.edu/taylor',
        opportunityInterests: ['Paid content'], contactConsent: true,
      },
    })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: 'Email confirmation is temporarily unavailable. Please try again later.',
    })
  })
})
