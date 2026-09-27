import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvCell, registerOfferInterestRoutes } from './interests'
import type { DbPool } from '../db/pool'

const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
function setup(role: 'anonymous' | 'unverified' | 'member' | 'admin' = 'member') {
  const app = Fastify(); apps.push(app)
  const query = vi.fn()
  const authorize = (admin = false) => () => {
    if (role === 'anonymous') throw Object.assign(new Error('Authentication required'), { statusCode: 401 })
    if (role === 'unverified' || admin && role !== 'admin') throw Object.assign(new Error('Access required'), { statusCode: 403 })
    return { id: 'member-user-id' }
  }
  registerOfferInterestRoutes(app, { query } as unknown as DbPool, authorize(), authorize(true))
  return { app, query }
}

describe('offer interest authorization and repeat submissions', () => {
  it.each(['anonymous', 'unverified'] as const)('requires verified signup before writing for %s users', async role => {
    const { app, query } = setup(role)
    const response = await app.inject({ method: 'POST', url: '/api/deals/event/interest', payload: {} })
    expect(response.statusCode).toBe(role === 'anonymous' ? 401 : 403)
    expect(query).not.toHaveBeenCalled()
  })
  it('saves a verified educator without any coordinates or activation writes', async () => {
    const { app, query } = setup()
    query.mockResolvedValueOnce({ rows: [{ id: 'event' }] }).mockResolvedValueOnce({ rows: [{ id: 'submission', submitted_at: '2026-09-27T00:00:00Z' }] })
    const response = await app.inject({ method: 'POST', url: '/api/deals/event/interest', payload: {} })
    expect(response.statusCode).toBe(201)
    expect(response.json().alreadySubmitted).toBe(false)
    expect(query.mock.calls[1][1].slice(1)).toEqual(['member-user-id', 'event'])
    expect(query.mock.calls.some(([sql]) => /INSERT INTO deal_activations|deal_usage_counters/.test(sql))).toBe(false)
  })
  it('returns the original submission on a duplicate click', async () => {
    const { app, query } = setup()
    query.mockResolvedValueOnce({ rows: [{ id: 'event' }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 'original', submitted_at: '2026-09-26T00:00:00Z' }] })
    const response = await app.inject({ method: 'POST', url: '/api/deals/event/interest', payload: {} })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ alreadySubmitted: true, submission: { id: 'original' } })
  })
  it('rejects unavailable offers before any interest insert', async () => {
    const { app, query } = setup()
    query.mockResolvedValueOnce({ rows: [] })
    const response = await app.inject({ method: 'POST', url: '/api/deals/event/interest', payload: {} })
    expect(response.statusCode).toBe(404)
    expect(query).toHaveBeenCalledTimes(1)
  })
  it.each(['anonymous', 'member'] as const)('protects list and CSV from %s access', async role => {
    const { app, query } = setup(role)
    for (const url of ['/api/admin/offer-interests', '/api/admin/offer-interests?export=csv']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(role === 'anonymous' ? 401 : 403)
    }
    expect(query).not.toHaveBeenCalled()
  })
  it('exports the complete filtered list with the requested identity fields', async () => {
    const { app, query } = setup('admin')
    query.mockResolvedValue({ rows: [{ member_id: 'VIP-123', full_name: '=SUM(1,2)', email: 'teacher@example.test', business_name: 'Example', event_name: 'Preview', cta_type: 'rsvp', submitted_at: new Date('2026-09-27T00:00:00Z') }] })
    const response = await app.inject({ method: 'GET', url: '/api/admin/offer-interests?dealId=event&export=csv' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.body).toContain('"VIP-123","\'=SUM(1,2)","teacher@example.test","Example","Preview","RSVP","2026-09-27T00:00:00.000Z"')
    expect(query.mock.calls[0][1]).toEqual(['event'])
    expect(query.mock.calls[0][0]).not.toContain('LIMIT')
  })
})

describe('CSV quoting', () => {
  it.each([['a,"b"', '"a,""b"""'], ['  +command', '"\'  +command"'], ['@command', '"\'@command"'], ['line\nnext', '"line\nnext"']])('safely exports %s', (value, expected) => {
    expect(csvCell(value)).toBe(expected)
  })
})
