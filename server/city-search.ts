import type { Config } from "./config.js"

type MapboxFeature = {
  id?: string
  properties?: { full_address?: string, name?: string, place_formatted?: string }
}

type MapboxResponse = { features?: MapboxFeature[] }

export type CitySuggestion = { id: string, label: string }

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
    if (!query || !config.MAPBOX_ACCESS_TOKEN) return []

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

    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      throw Object.assign(
        new Error(
          "City suggestions are temporarily unavailable. You can still enter your city manually.",
        ),
        { statusCode: 502 },
      )
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
    cache.set(key, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, values })
    if (cache.size > 1000) cache.delete(cache.keys().next().value!)
    return values
  }
}
