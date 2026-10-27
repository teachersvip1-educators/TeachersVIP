import tzLookup from "tz-lookup"
import type { Config } from "./config.js"
import { normalizeUsCity } from "../shared/us-city.js"

type MapboxFeature = {
  id?: string
  properties?: {
    mapbox_id?: string
    full_address?: string
    name?: string
    place_formatted?: string
    context?: { country?: { country_code?: string }; region?: { name?: string }; place?: { name?: string } }
    coordinates?: { latitude?: number, longitude?: number }
  }
  geometry?: { coordinates?: [number, number] }
}

type MapboxResponse = { features?: MapboxFeature[] }
type OpenMeteoResult = {
  id?: number
  name?: string
  admin1?: string
  state?: string
  country?: string
  country_code?: string
  timezone?: string
  latitude?: number
  longitude?: number
}
type OpenMeteoResponse = { results?: OpenMeteoResult[] }

export type CitySearchKind = "city" | "address"
export type CitySuggestion = {
  id: string
  label: string
  provider?: "mapbox" | "open-meteo" | "local"
  timezone?: string
  latitude?: number
  longitude?: number
}

const LOCAL_CITIES: CitySuggestion[] = [
  ["Houston, Texas, United States", "houston-tx", "America/Chicago"],
  ["Dallas, Texas, United States", "dallas-tx", "America/Chicago"],
  ["Austin, Texas, United States", "austin-tx", "America/Chicago"],
  ["San Antonio, Texas, United States", "san-antonio-tx", "America/Chicago"],
  ["New York, New York, United States", "new-york-ny", "America/New_York"],
  ["Chicago, Illinois, United States", "chicago-il", "America/Chicago"],
  ["Los Angeles, California, United States", "los-angeles-ca", "America/Los_Angeles"],
  ["Atlanta, Georgia, United States", "atlanta-ga", "America/New_York"],
  ["Denver, Colorado, United States", "denver-co", "America/Denver"],
  ["Phoenix, Arizona, United States", "phoenix-az", "America/Phoenix"],
  ["Seattle, Washington, United States", "seattle-wa", "America/Los_Angeles"],
  ["Boston, Massachusetts, United States", "boston-ma", "America/New_York"],
  ["Miami, Florida, United States", "miami-fl", "America/New_York"],
  ["Charlotte, North Carolina, United States", "charlotte-nc", "America/New_York"],
  ["Washington, District of Columbia, United States", "washington-dc", "America/New_York"],
].map(([label, id, timezone]) => ({ label: normalizeUsCity(label)!, id, timezone, provider: "local" }))

function localCitySuggestions(query: string): CitySuggestion[] {
  const normalized = query.toLocaleLowerCase("en-US")
  return LOCAL_CITIES.filter((city) =>
    city.label.toLocaleLowerCase("en-US").includes(normalized),
  ).slice(0, 10)
}

function timezoneForCoordinates(latitude?: number, longitude?: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  try {
    return tzLookup(latitude!, longitude!)
  } catch {
    return undefined
  }
}

function coordinatesForFeature(feature: MapboxFeature) {
  const properties = feature.properties?.coordinates
  if (Number.isFinite(properties?.latitude) && Number.isFinite(properties?.longitude))
    return { latitude: properties!.latitude!, longitude: properties!.longitude! }
  const [longitude, latitude] = feature.geometry?.coordinates || []
  if (Number.isFinite(latitude) && Number.isFinite(longitude))
    return { latitude, longitude }
  return undefined
}

async function searchOpenMeteo(
  query: string,
  fetcher: typeof fetch,
): Promise<CitySuggestion[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search")
  url.searchParams.set("name", query)
  url.searchParams.set("count", "10")
  url.searchParams.set("language", "en")
  url.searchParams.set("format", "json")
  url.searchParams.set("countryCode", "US")
  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return []
    const payload = (await response.json()) as OpenMeteoResponse
    const seen = new Set<string>()
    return (payload.results ?? []).flatMap((result, index) => {
      if (!result.name || (result.country_code?.toUpperCase() !== 'US' && result.country !== 'United States')) return []
      const label = normalizeUsCity([result.name, result.admin1 || result.state].filter(Boolean).join(', '))
      if (!label) return []
      const normalized = label.toLocaleLowerCase("en-US")
      if (!label || seen.has(normalized)) return []
      seen.add(normalized)
      return [{
        id: String(result.id || `open-meteo-${index}`),
        label,
        provider: "open-meteo" as const,
        timezone: result.timezone,
        latitude: result.latitude,
        longitude: result.longitude,
      }]
    })
  } catch {
    return []
  }
}

function normalizeMapboxFeatures(
  features: MapboxFeature[] | undefined,
  key: string,
  kind: CitySearchKind = 'address',
): CitySuggestion[] {
  const seen = new Set<string>()
  return (features ?? []).flatMap((feature, index) => {
    const properties = feature.properties ?? {}
    if (properties.context?.country?.country_code && properties.context.country.country_code.toUpperCase() !== 'US') return []
    const fullLabel = (
      properties.full_address ||
      [properties.name, properties.place_formatted].filter(Boolean).join(", ")
    ).trim()
    const contextCity = [properties.context?.place?.name || properties.name, properties.context?.region?.name].filter(Boolean).join(', ')
    const label = kind === 'city' ? normalizeUsCity(contextCity) || normalizeUsCity(fullLabel) : fullLabel
    if (!label) return []
    const normalized = label.toLocaleLowerCase("en-US")
    if (!label || seen.has(normalized)) return []
    seen.add(normalized)
    const coordinates = coordinatesForFeature(feature)
    return [{
      id: feature.id || properties.mapbox_id || `${key}-${index}`,
      label,
      provider: "mapbox" as const,
      ...coordinates,
      timezone: timezoneForCoordinates(coordinates?.latitude, coordinates?.longitude),
    }]
  })
}

export function createCitySearch(
  config: Config,
  fetcher: typeof fetch = fetch,
) {
  const cache = new Map<string, {
    expiresAt: number
    values: CitySuggestion[]
  }>()

  return async function searchCities(
    rawQuery: string,
    kind: CitySearchKind = "city",
  ): Promise<CitySuggestion[]> {
    const query = rawQuery.trim().replace(/\s+/g, " ")
    if (!query) return []
    const fallback = localCitySuggestions(query)

    if (!config.MAPBOX_PUBLIC_TOKEN) {
      const key = `${kind}:${query.toLocaleLowerCase("en-US")}`
      const cached = cache.get(key)
      if (cached && cached.expiresAt > Date.now()) return cached.values
      const openMeteoValues = await searchOpenMeteo(query, fetcher)
      const values = openMeteoValues.length ? openMeteoValues : fallback
      cache.set(key, {
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        values,
      })
      return values
    }

    const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
    url.searchParams.set(
      "types",
      kind === "address"
        ? "address,secondary_address,street,place,locality"
        : "place,locality",
    )
    url.searchParams.set("q", query)
    url.searchParams.set("autocomplete", "true")
    url.searchParams.set("permanent", "false")
    url.searchParams.set("limit", "10")
    url.searchParams.set("language", "en")
    url.searchParams.set("country", "us")
    url.searchParams.set("access_token", config.MAPBOX_PUBLIC_TOKEN)

    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return fallback
      const payload = (await response.json()) as MapboxResponse
      const values = normalizeMapboxFeatures(
        payload.features,
        `${kind}:${query.toLocaleLowerCase("en-US")}`,
        kind,
      )
      return values.length ? values : fallback
    } catch {
      return fallback
    }
  }
}

export async function resolveMapboxSuggestion(
  config: Config,
  rawMapboxId: string,
  fetcher: typeof fetch = fetch,
): Promise<CitySuggestion | null> {
  const mapboxId = rawMapboxId.trim()
  if (!config.MAPBOX_PUBLIC_TOKEN || !mapboxId) return null

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
  url.searchParams.set("q", mapboxId)
  url.searchParams.set("autocomplete", "false")
  url.searchParams.set("permanent", "true")
  url.searchParams.set("limit", "1")
  url.searchParams.set("language", "en")
  url.searchParams.set("country", "us")
  url.searchParams.set("access_token", config.MAPBOX_PUBLIC_TOKEN)

  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return null
    const payload = (await response.json()) as MapboxResponse
    return normalizeMapboxFeatures(payload.features, mapboxId)[0] ?? null
  } catch {
    return null
  }
}
