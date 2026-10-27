import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { acquireDealLocation, locationDenialMessage } from "./deal-location"

const target = { latitude: 29.934147087549, longitude: -95.248639723487 }
const fix = (accuracy = 5, latitude = target.latitude, timestamp = Date.now()): GeolocationPosition => ({
  coords: { latitude, longitude: target.longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp,
}) as GeolocationPosition

function gps() {
  let success: PositionCallback
  let failure: PositionErrorCallback
  const geolocation = {
    watchPosition: vi.fn((ok: PositionCallback, error?: PositionErrorCallback | null, _options?: PositionOptions) => { success = ok; failure = error!; return 17 }),
    clearWatch: vi.fn(),
  }
  const controller = new AbortController()
  const onProgress = vi.fn()
  const start = (timeoutMs = 30_000) => acquireDealLocation({ target, radiusM: 150, geolocation, isSecureContext: true, signal: controller.signal, onProgress, timeoutMs })
  return { geolocation, controller, onProgress, start, emit: (p: GeolocationPosition) => success(p), fail: (code: number) => failure({ code } as GeolocationPositionError) }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-21T12:00:00Z")) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe("deal location acquisition", () => {
  it('ignores cached readings predating this attempt even if they are otherwise fresh', async () => {
    const g = gps(), done = vi.fn()
    const promise = g.start().then(done)
    g.emit(fix(5, target.latitude, Date.now() - 5000))
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    expect(g.onProgress).not.toHaveBeenCalled()
    const current = fix()
    g.emit(current)
    await promise
    expect(done).toHaveBeenCalledExactlyOnceWith(current)
  })
  it("waits through a coarse first fix and submits the precise observation with its real timestamp", async () => {
    const g = gps(), done = vi.fn()
    const promise = g.start().then(done)
    g.emit(fix(1200))
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    expect(g.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "low_accuracy", accuracyM: 1200 }))
    await vi.advanceTimersByTimeAsync(2500)
    const precise = fix(10)
    g.emit(precise)
    await promise
    expect(done).toHaveBeenCalledExactlyOnceWith(precise)
    expect(g.geolocation.watchPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 })
    expect(g.geolocation.clearWatch).toHaveBeenCalledExactlyOnceWith(17)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not trust a coarse outside fix before a later on-site fix", async () => {
    const g = gps(), done = vi.fn()
    const promise = g.start().then(done)
    g.emit(fix(1000, target.latitude + 0.03))
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    g.emit(fix(7))
    await promise
    expect(done).toHaveBeenCalledOnce()
  })

  it("returns a precise outside reading for server denial without fabricating proximity", async () => {
    const g = gps(), promise = g.start(), outside = fix(8, target.latitude + 0.02)
    g.emit(outside)
    expect(await promise).toBe(outside)
    expect(g.onProgress).toHaveBeenCalledWith(expect.objectContaining({ decision: "outside" }))
  })

  it("ignores stale, invalid and future readings", async () => {
    const g = gps(), promise = g.start()
    g.emit(fix(5, target.latitude, Date.now() - 60_000))
    g.emit(fix(5, 120))
    g.emit(fix(5, target.latitude, Date.now() + 60_000))
    g.emit(fix(Number.NaN))
    expect(g.onProgress).not.toHaveBeenCalled()
    const valid = fix()
    g.emit(valid)
    expect(await promise).toBe(valid)
  })

  it("retains the best fresh fix until the deadline without accepting uncertain proximity", async () => {
    const g = gps(), promise = g.start(10_000)
    const better = fix(200)
    g.emit(better)
    g.emit(fix(500))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await promise).toBe(better)
    expect(g.onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "low_accuracy", accuracyM: 200 }))
    expect(g.geolocation.clearWatch).toHaveBeenCalledOnce()
  })

  it("rejects an old best fix instead of re-labelling it as current", async () => {
    const g = gps(), result = expect(g.start()).rejects.toMatchObject({ reason: "timeout" })
    g.emit(fix(200))
    await vi.advanceTimersByTimeAsync(30_000)
    await result
  })

  it("replaces an expired accurate fix with a fresh coarse fix", async () => {
    const g = gps(), promise = g.start()
    g.emit(fix(200))
    await vi.advanceTimersByTimeAsync(20_000)
    const fresh = fix(300)
    g.emit(fresh)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await promise).toBe(fresh)
  })

  it("handles Safari permission denial without a GeolocationPositionError global and supports retry", async () => {
    vi.stubGlobal("GeolocationPositionError", undefined)
    const g = gps(), result = expect(g.start()).rejects.toMatchObject({ reason: "permission" })
    g.fail(1)
    await result
    expect(vi.getTimerCount()).toBe(0)
    expect(g.geolocation.clearWatch).toHaveBeenCalledOnce()
    const retry = g.start()
    g.emit(fix())
    await expect(retry).resolves.toMatchObject({ coords: { accuracy: 5 } })
  })

  it.each([2, 3])("recovers from transient browser error %s within the overall deadline", async (code) => {
    const g = gps(), promise = g.start()
    g.fail(code)
    g.emit(fix())
    await expect(promise).resolves.toBeDefined()
  })

  it("bounds a silent browser and clears tracking", async () => {
    const g = gps(), result = expect(g.start()).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(30_000)
    await result
    expect(g.geolocation.clearWatch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels and ignores callbacks after navigation or cancellation", async () => {
    const g = gps(), result = expect(g.start()).rejects.toMatchObject({ name: "AbortError" })
    g.controller.abort()
    g.emit(fix())
    await result
    expect(g.onProgress).not.toHaveBeenCalled()
    expect(g.geolocation.clearWatch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not start GPS for an already cancelled request", async () => {
    const g = gps()
    g.controller.abort()
    await expect(g.start()).rejects.toMatchObject({ name: "AbortError" })
    expect(g.geolocation.watchPosition).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("handles synchronous adapter callbacks without leaking a watcher", async () => {
    const clearWatch = vi.fn()
    await expect(acquireDealLocation({ target, radiusM: 150, signal: new AbortController().signal, isSecureContext: true,
      geolocation: { watchPosition: (ok) => { ok(fix()); return 19 }, clearWatch },
    })).resolves.toBeDefined()
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(19)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("rejects insecure contexts and unavailable geolocation", async () => {
    const g = gps()
    await expect(acquireDealLocation({ target, radiusM: 150, signal: g.controller.signal, geolocation: g.geolocation, isSecureContext: false })).rejects.toMatchObject({ reason: "insecure" })
    vi.stubGlobal("navigator", {})
    await expect(acquireDealLocation({ target, radiusM: 150, signal: g.controller.signal, isSecureContext: true })).rejects.toMatchObject({ reason: "unavailable" })
    expect(g.geolocation.watchPosition).not.toHaveBeenCalled()
  })
})

describe("location denial diagnostics", () => {
  it("explains actual uncertainty and distance from structured server denials", () => {
    expect(locationDenialMessage("Denied", { reason: "low_accuracy", accuracyM: 702.1 })).toContain("±703 m")
    expect(locationDenialMessage("Be at the business.", { reason: "outside_radius", distanceM: 1320 })).toContain("1.3 km")
    expect(locationDenialMessage("Be at the business.", { reason: "outside_radius", distanceM: 230 })).toContain("230 m")
    expect(locationDenialMessage("Usage limit reached.", { reason: "limit_reached" })).toBe("Usage limit reached.")
  })
})
