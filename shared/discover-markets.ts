export const DISCOVER_MARKETS = [
  { id: "houston", label: "Houston, TX", name: "Houston" },
  { id: "dallas-fort-worth", label: "Dallas–Fort Worth, TX", name: "Dallas–Fort Worth" },
  { id: "indianapolis", label: "Indianapolis, IN", name: "Indianapolis" },
  { id: "atlanta", label: "Atlanta, GA", name: "Atlanta" },
  { id: "miami", label: "Miami, FL", name: "Miami" },
  { id: "orlando", label: "Orlando, FL", name: "Orlando" },
  { id: "tampa", label: "Tampa, FL", name: "Tampa" },
  { id: "washington-dc-maryland", label: "Washington, DC / Maryland", name: "Washington, DC / Maryland" },
  { id: "chicago", label: "Chicago, IL", name: "Chicago" },
] as const

export type DiscoverMarket = (typeof DISCOVER_MARKETS)[number]
export type DiscoverMarketId = DiscoverMarket["id"]

export const DEFAULT_DISCOVER_MARKET = DISCOVER_MARKETS[0]

export function findDiscoverMarket(value: unknown): DiscoverMarket | undefined {
  return DISCOVER_MARKETS.find(market => market.id === value)
}
