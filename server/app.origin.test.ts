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
  it('allows the configured remote deal-image host in production', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health/live' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-security-policy']).toContain("img-src 'self' data: https://images.unsplash.com")
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
})
