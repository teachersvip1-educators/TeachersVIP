import { describe, expect, it } from "vitest"
import { publicOffersForMarket } from "./public-offers"

describe("public offers by market", () => {
  it("shows exactly the offers redeemable in Houston", () => {
    expect(publicOffersForMarket("houston").map((offer) => offer.id)).toEqual([
      "childrens-museum-houston",
      "dave-and-busters-houston",
      "half-price-books",
      "texas-de-brazil",
    ])
  })

  it("keeps city-specific offers in their own city", () => {
    expect(publicOffersForMarket("phoenix").map((offer) => offer.id)).toEqual([
      "pinedas-auto-glass",
      "tap-that-downtown",
      "dave-and-busters-phoenix",
      "arizona-grand-resort",
    ])
    expect(publicOffersForMarket("mesa").map((offer) => offer.id)).toEqual(["meineke-mesa"])
    expect(publicOffersForMarket("washington-dc").map((offer) => offer.id)).toEqual([
      "national-museum-of-women-in-the-arts",
    ])
    expect(publicOffersForMarket("bethesda").map((offer) => offer.id)).toEqual(["kid-museum"])
  })

  it("includes offers in applicable regional markets", () => {
    expect(publicOffersForMarket("maryland").map((offer) => offer.id)).toEqual(["kid-museum"])
    expect(publicOffersForMarket("dallas-fort-worth").map((offer) => offer.id)).toEqual([
      "half-price-books",
      "texas-de-brazil",
    ])
  })
})
