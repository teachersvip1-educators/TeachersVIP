export const DISCOVER_MARKETS = [
  { id: "houston", label: "Houston, TX", name: "Houston" },
  { id: "dallas-fort-worth", label: "Dallas–Fort Worth, TX", name: "Dallas–Fort Worth" },
  { id: "indianapolis", label: "Indianapolis, IN", name: "Indianapolis" },
  { id: "atlanta", label: "Atlanta, GA", name: "Atlanta" },
  { id: "miami", label: "Miami, FL", name: "Miami" },
  { id: "orlando", label: "Orlando, FL", name: "Orlando" },
  { id: "tampa", label: "Tampa, FL", name: "Tampa" },
  { id: "washington-dc", label: "Washington, DC", name: "Washington, DC" },
  { id: "maryland", label: "Maryland", name: "Maryland" },
  { id: "new-orleans", label: "New Orleans, LA", name: "New Orleans" },
  { id: "nashville", label: "Nashville, TN", name: "Nashville" },
  { id: "phoenix", label: "Phoenix, AZ", name: "Phoenix" },
  { id: "chicago", label: "Chicago, IL", name: "Chicago" },
] as const

export const LEGACY_DISCOVER_MARKET = {
  id: "washington-dc-maryland",
  label: "Washington, DC / Maryland",
  name: "Washington, DC / Maryland",
} as const

export type DiscoverMarket = (typeof DISCOVER_MARKETS)[number] | typeof LEGACY_DISCOVER_MARKET
export type DiscoverMarketId = DiscoverMarket["id"]

export const DEFAULT_DISCOVER_MARKET = DISCOVER_MARKETS[0]

export function findDiscoverMarket(value: unknown): DiscoverMarket | undefined {
  return value === LEGACY_DISCOVER_MARKET.id
    ? LEGACY_DISCOVER_MARKET
    : DISCOVER_MARKETS.find(market => market.id === value)
}
