import { afterEach, expect, it, vi } from "vitest"
import { api } from "./api"

afterEach(() => vi.unstubAllGlobals())

it("preserves structured location denials for actionable accuracy feedback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Location is imprecise.", reason: "low_accuracy", accuracyM: 900, distanceM: 20 }), { status: 422 })))
  await expect(api("/deals/example/activate")).rejects.toMatchObject({ message: "Location is imprecise.", details: { reason: "low_accuracy", accuracyM: 900, distanceM: 20 } })
})
