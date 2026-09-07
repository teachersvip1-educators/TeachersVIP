import { describe, expect, it } from 'vitest'
import { getUsageBucket, usageScopeKey } from './usage.js'

describe('deal usage buckets', () => {
  const at = new Date('2026-09-01T00:30:00.000Z')

  it('uses the business location timezone for daily and monthly limits', () => {
    expect(getUsageBucket({ period: 'day', at, timeZone: 'America/Los_Angeles' }).key).toBe('day:2026-08-31')
    expect(getUsageBucket({ period: 'month', at, timeZone: 'America/Los_Angeles' }).key).toBe('month:2026-08')
  })

  it('keeps promotional buckets stable and returns no bucket outside the window', () => {
    const startsAt = '2026-09-01T00:00:00.000Z'
    const endsAt = '2026-09-30T23:59:59.000Z'
    expect(getUsageBucket({ period: 'promo', at, timeZone: 'UTC', promoStartsAt: startsAt, promoEndsAt: endsAt }).key).toContain('promo:2026-09-01T00:00:00.000Z:')
    expect(getUsageBucket({ period: 'promo', at: new Date('2026-10-01T00:00:00.000Z'), timeZone: 'UTC', promoStartsAt: startsAt, promoEndsAt: endsAt }).key).toBeNull()
  })

  it('requires a location for location-scoped counters', () => {
    expect(usageScopeKey('offer')).toBe('offer')
    expect(usageScopeKey('location', 'loc-1')).toBe('location:loc-1')
    expect(() => usageScopeKey('location')).toThrow('business location')
  })

  it('uses one stable bucket for a one-time-only offer', () => {
    expect(getUsageBucket({ period: 'lifetime', at, timeZone: 'America/Chicago' }).key).toBe('lifetime')
  })
})
