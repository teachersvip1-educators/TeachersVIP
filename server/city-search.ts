import type { Config } from "./config.js"

type MapboxFeature = {
  id?: string
  properties?: { full_address?: string, name?: string, place_formatted?: string }
}

type MapboxResponse = { features?: MapboxFeature[] }

export type CitySuggestion = { id: string, label: string }

const LOCAL_CITIES: CitySuggestion[] = [
  ["Houston, Texas, United States", "houston-tx"],
  ["Dallas, Texas, United States", "dallas-tx"],
  ["Austin, Texas, United States", "austin-tx"],
  ["San Antonio, Texas, United States", "san-antonio-tx"],
  ["New York, New York, United States", "new-york-ny"],
  ["Chicago, Illinois, United States", "chicago-il"],
  ["Los Angeles, California, United States", "los-angeles-ca"],
  ["Atlanta, Georgia, United States", "atlanta-ga"],
  ["Denver, Colorado, United States", "denver-co"],
  ["Phoenix, Arizona, United States", "phoenix-az"],
  ["Seattle, Washington, United States", "seattle-wa"],
  ["Boston, Massachusetts, United States", "boston-ma"],
  ["Miami, Florida, United States", "miami-fl"],
  ["Charlotte, North Carolina, United States", "charlotte-nc"],
  ["Washington, District of Columbia, United States", "washington-dc"],
].map(([label, id]) => ({ label, id }))

function localCitySuggestions(query: string): CitySuggestion[] {
  const normalized = query.toLocaleLowerCase("en-US")
  return LOCAL_CITIES.filter((city) =>
    city.label.toLocaleLowerCase("en-US").includes(normalized),
  ).slice(0, 10)
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
  ): Promise<CitySuggestion[]> {
    const query = rawQuery.trim().replace(/\s+/g, " ")
    if (!query) return []
    const fallback = localCitySuggestions(query)
    if (!config.MAPBOX_ACCESS_TOKEN) return fallback

    const key = query.toLocaleLowerCase("en-US")
    const cached = cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.values

    const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
    url.searchParams.set("q", query)
    url.searchParams.set("types", "place,locality")
    url.searchParams.set("autocomplete", "true")
    url.searchParams.set("limit", "10")
    url.searchParams.set("language", "en")
    url.searchParams.set("access_token", config.MAPBOX_ACCESS_TOKEN)

    try {
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return fallback
      const payload = (await response.json()) as MapboxResponse
    const seen = new Set<string>()
    const values = (payload.features ?? []).flatMap((feature, index) => {
      const properties = feature.properties ?? {}
      const label = (
        properties.full_address ||
        [properties.name, properties.place_formatted].filter(Boolean).join(", ")
      ).trim()
      const normalized = label.toLocaleLowerCase("en-US")
      if (!label || seen.has(normalized)) return []
      seen.add(normalized)
      return [{ id: feature.id || `${key}-${index}`, label }]
    })
    const resolved = values.length ? values : fallback
    cache.set(key, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, values: resolved })
    if (cache.size > 1000) cache.delete(cache.keys().next().value!)
    return resolved
    } catch {
      return fallback
    }
  }
}
