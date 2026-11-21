import { describe, expect, it, vi } from 'vitest'
import { createCitySearch, geocodeStreetAddress, resolveMapboxSuggestion } from './city-search'
import { getConfig } from './config'

const base = getConfig({
  NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost/test',
  APP_URL: 'http://localhost:8443', SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  DATA_ENCRYPTION_KEY: '11'.repeat(32), MAPBOX_PUBLIC_TOKEN: 'pk.test-token',
})

describe('city search', () => {
  it('normalizes provider results without caching temporary Mapbox queries', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('autocomplete')).toBe('true')
      expect(url.searchParams.get('permanent')).toBe('false')
      expect(url.searchParams.get('country')).toBe('us')
      return new Response(JSON.stringify({ features: [
        { id: 'place.1', properties: { name: 'Austin', place_formatted: 'Texas, United States' }, geometry: { coordinates: [-97.7431, 30.2672] } },
        { id: 'place.2', properties: { full_address: 'Austin, Texas, United States' } },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    const search = createCitySearch(base, fetcher)
    expect(await search(' austin ')).toEqual([{ id: 'place.1', label: 'Austin, Texas', provider: 'mapbox', latitude: 30.2672, longitude: -97.7431, timezone: 'America/Chicago' }])
    expect(await search('Austin')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('uses address mode for location setup and keeps coordinates for timezone lookup', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('types')).toBe('address,secondary_address,street,place,locality')
      return new Response(JSON.stringify({ features: [
        { id: 'address.1', properties: { full_address: '1600 Pennsylvania Avenue NW, Washington, DC, United States' }, geometry: { coordinates: [-77.0365, 38.8977] } },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    const search = createCitySearch(base, fetcher)
    await expect(search('1600 penn', 'address')).resolves.toEqual([
      { id: 'address.1', label: '1600 Pennsylvania Avenue NW, Washington, DC, United States', provider: 'mapbox', latitude: 38.8977, longitude: -77.0365, timezone: 'America/New_York' },
    ])
  })

  it('permanently resolves a selected Mapbox address before storage', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get('q')).toBe('address.1')
      expect(url.searchParams.get('autocomplete')).toBe('false')
      expect(url.searchParams.get('permanent')).toBe('true')
      expect(url.searchParams.get('limit')).toBe('1')
      return new Response(JSON.stringify({ features: [
        { id: 'address.1', properties: { full_address: '1600 Pennsylvania Avenue NW, Washington, DC, United States' }, geometry: { coordinates: [-77.0365, 38.8977] } },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    await expect(resolveMapboxSuggestion(base, 'address.1', fetcher)).resolves.toEqual({
      id: 'address.1', label: '1600 Pennsylvania Avenue NW, Washington, DC, United States',
      provider: 'mapbox', latitude: 38.8977, longitude: -77.0365, timezone: 'America/New_York',
    })
  })

  it('geocodes an admin-typed street address and rejects weak or unavailable matches', async () => {
    const feature = (confidence: string) => ({ features: [{
      id: 'address.9', properties: { full_address: '1201 Main Street, Houston, Texas 77002, United States', match_code: { confidence } },
      geometry: { coordinates: [-95.3655, 29.7556] },
    }] })
    const fetcher = (confidence: string) => vi.fn(async (url: URL) => {
      expect(url.searchParams.get('types')).toBe('address,secondary_address')
      expect(url.searchParams.get('permanent')).toBe('true')
      return new Response(JSON.stringify(feature(confidence)), { status: 200 })
    }) as unknown as typeof fetch
    await expect(geocodeStreetAddress(base, ' 1201 Main St, Houston TX ', fetcher('exact'))).resolves.toMatchObject({
      latitude: 29.7556, longitude: -95.3655, timezone: 'America/Chicago',
    })
    await expect(geocodeStreetAddress(base, '1201 Main St, Houston TX', fetcher('low'))).resolves.toBeNull()
    const unused = fetcher('exact')
    await expect(geocodeStreetAddress({ ...base, MAPBOX_PUBLIC_TOKEN: undefined }, '1201 Main St, Houston TX', unused)).resolves.toBeNull()
    expect(unused).not.toHaveBeenCalled()
  })

  it('allows manual entry when no provider is configured', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_PUBLIC_TOKEN: undefined }, fetcher)
    expect(await search('Anywhere')).toEqual([])
  })

  it('restricts no-key geocoding to US cities and displays only city and state', async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.hostname).toBe('geocoding-api.open-meteo.com')
      expect(url.searchParams.get('countryCode')).toBe('US')
      return new Response(JSON.stringify({ results: [
        { id: 1, name: 'Cape Town', admin1: 'Western Cape', country: 'South Africa', timezone: 'Africa/Johannesburg', latitude: -33.9249, longitude: 18.4241 },
        { id: 2, name: 'Houston', admin1: 'Texas', country_code: 'US', timezone: 'America/Chicago', latitude: 29.76, longitude: -95.37 },
      ] }), { status: 200 })
    }) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_PUBLIC_TOKEN: undefined }, fetcher)
    await expect(search('Houston')).resolves.toEqual([
      { id: '2', label: 'Houston, Texas', provider: 'open-meteo', timezone: 'America/Chicago', latitude: 29.76, longitude: -95.37 },
    ])
  })

  it('offers a local city fallback when the provider is not configured', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_PUBLIC_TOKEN: undefined }, fetcher)
    expect(await search('Hou')).toContainEqual({
      id: 'houston-tx',
      label: 'Houston, Texas',
      provider: 'local',
      timezone: 'America/Chicago',
    })
  })
  it('does not expose international cities in the local fallback', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const search = createCitySearch({ ...base, MAPBOX_PUBLIC_TOKEN: undefined }, fetcher)
    expect(await search('Toronto')).toEqual([])
    expect(await search('London')).toEqual([])
  })
  it('rejects international provider results even if a provider ignores the country filter', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ features: [
      { properties: { name: 'London', place_formatted: 'England, United Kingdom', context: { country: { country_code: 'GB' } } } },
    ] }))) as unknown as typeof fetch
    expect(await createCitySearch(base, fetcher)('London')).toEqual([])
  })
})
