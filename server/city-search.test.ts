import { describe, expect, it, vi } from 'vitest'
import { createCitySearch } from './city-search'
import { getConfig } from './config'

const base = getConfig({
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost/test',
  APP_URL: 'http://localhost:8443', SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  DATA_ENCRYPTION_KEY: '11'.repeat(32), MAPBOX_ACCESS_TOKEN: 'pk.test-token',
})

describe('city search', () => {
  it('normalizes provider results and caches repeated queries', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ features: [
      { id: 'place.1', properties: { name: 'Austin', place_formatted: 'Texas, United States' } },
      { id: 'place.2', properties: { full_address: 'Austin, Texas, United States' } },
    ] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch(base, fetcher)
    expect(await search(' austin ')).toEqual([{ id: 'place.1', label: 'Austin, Texas, United States' }])
    expect(await search('Austin')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('allows manual entry when no provider is configured', async () => {
    const search = createCitySearch({ ...base, MAPBOX_ACCESS_TOKEN: undefined })
    expect(await search('Anywhere')).toEqual([])
  })
})
