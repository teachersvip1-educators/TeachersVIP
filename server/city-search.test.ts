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
      { id: 'place.1', properties: { name: 'Austin', place_formatted: 'Texas, United States' }, geometry: { coordinates: [-97.7431, 30.2672] } },
      { id: 'place.2', properties: { full_address: 'Austin, Texas, United States' } },
    ] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch(base, fetcher)
    expect(await search(' austin ')).toEqual([{ id: 'place.1', label: 'Austin, Texas, United States', latitude: 30.2672, longitude: -97.7431, timezone: 'America/Chicago' }])
    expect(await search('Austin')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('uses address mode for location setup and keeps coordinates for timezone lookup', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('types')).toBe('address,place,locality')
      return new Response(JSON.stringify({ features: [
        { id: 'address.1', properties: { full_address: '1600 Pennsylvania Avenue NW, Washington, DC, United States' }, geometry: { coordinates: [-77.0365, 38.8977] } },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    const search = createCitySearch(base, fetcher)
    await expect(search('1600 penn', 'address')).resolves.toEqual([
      { id: 'address.1', label: '1600 Pennsylvania Avenue NW, Washington, DC, United States', latitude: 38.8977, longitude: -77.0365, timezone: 'America/New_York' },
    ])
  })

  it('allows manual entry when no provider is configured', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_ACCESS_TOKEN: undefined }, fetcher)
    expect(await search('Anywhere')).toEqual([])
  })

  it('uses the global no-key geocoder when Mapbox is not configured', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.hostname).toBe('geocoding-api.open-meteo.com')
      return new Response(JSON.stringify({ results: [
        { id: 1, name: 'Cape Town', admin1: 'Western Cape', country: 'South Africa', timezone: 'Africa/Johannesburg', latitude: -33.9249, longitude: 18.4241 },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_ACCESS_TOKEN: undefined }, fetcher)
    await expect(search('Cape Town')).resolves.toEqual([
      { id: '1', label: 'Cape Town, Western Cape, South Africa', timezone: 'Africa/Johannesburg', latitude: -33.9249, longitude: 18.4241 },
    ])
  })

  it('offers a local city fallback when the provider is not configured', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_ACCESS_TOKEN: undefined }, fetcher)
    expect(await search('Hou')).toContainEqual({
      id: 'houston-tx',
      label: 'Houston, Texas, United States',
      timezone: 'America/Chicago',
    })
  })
})
