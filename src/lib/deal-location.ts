import { validateProximity, type Coordinates, type ProximityCheckResult } from "../../shared/geolocation"

export class DealLocationError extends Error {
  constructor(public reason: "permission" | "unavailable" | "timeout" | "insecure", message: string) {
    super(message)
  }
}

export const LOCATION_PERMISSION_HELP = "On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, with Precise Location on. Also allow Location in this website’s Safari settings. On Android: allow Location for this site in Chrome and turn on precise location for Chrome."

interface LocationOptions {
  target: Coordinates
  radiusM: number
  signal: AbortSignal
  onProgress?: (reading: ProximityCheckResult) => void
  geolocation?: Pick<Geolocation, "watchPosition" | "clearWatch">
  isSecureContext?: boolean
  timeoutMs?: number
}

/** Collect fresh fixes until proximity is confident, with a bounded GPS warm-up. */
export function acquireDealLocation(options: LocationOptions): Promise<GeolocationPosition> {
  const geolocation = options.geolocation ?? globalThis.navigator?.geolocation
  if (!(options.isSecureContext ?? globalThis.isSecureContext)) {
    return Promise.reject(new DealLocationError("insecure", "Location verification requires a secure connection. Open TeachersVIP using https://teachersvip.net and try again."))
  }
  if (!geolocation) {
    return Promise.reject(new DealLocationError("unavailable", "Location services are unavailable in this browser. Open TeachersVIP in Safari or Chrome and allow location access."))
  }

  return new Promise((resolve, reject) => {
    let watchId: number | undefined
    let settled = false
    let best: GeolocationPosition | undefined
    let lastErrorCode: number | undefined
    const check = (position: GeolocationPosition) => validateProximity({
      observation: { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, observedAt: new Date(position.timestamp) },
      target: options.target,
      radiusM: options.radiusM,
      maxAgeMs: 15_000,
    })
    const cleanup = () => {
      clearTimeout(timer)
      if (watchId !== undefined) geolocation.clearWatch(watchId)
      options.signal.removeEventListener("abort", abort)
    }
    const finish = (position?: GeolocationPosition, error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (position) resolve(position)
      else reject(error)
    }
    const abort = () => finish(undefined, new DOMException("Location check cancelled.", "AbortError"))
    const timer = setTimeout(() => {
      // An initially usable fix can become stale while GPS warms up.
      if (best && ["inside", "outside", "low_accuracy"].includes(check(best).decision)) {
        finish(best) // The server makes the final decision, including denials.
      } else {
        finish(undefined, new DealLocationError(lastErrorCode === 2 ? "unavailable" : "timeout",
          best
            ? `Your device has not provided a fresh, precise location (last accuracy: ±${Math.ceil(best.coords.accuracy)} m). Turn on Precise Location and Wi-Fi, keep this page open, and try again near the entrance.`
            : "We could not get a fresh location. Check that Location Services and Wi-Fi are on, keep this page open, and try again near the business entrance."))
      }
    }, options.timeoutMs ?? 30_000)
    options.signal.addEventListener("abort", abort, { once: true })
    if (options.signal.aborted) { abort(); return }

    try {
      // Invoke directly from Use Deal: no asynchronous permissions preflight.
      watchId = geolocation.watchPosition((position) => {
        if (settled) return
        const reading = check(position)
        if (["invalid", "stale"].includes(reading.decision)) return
        if (!best || ["invalid", "stale"].includes(check(best).decision) || position.coords.accuracy <= best.coords.accuracy) best = position
        options.onProgress?.(check(best))
        if (reading.decision === "inside" || (reading.decision === "outside" && position.coords.accuracy <= Math.min(50, options.radiusM / 3))) finish(position)
      }, (error) => {
        if (settled) return
        lastErrorCode = error.code
        // Numeric codes work without a global GeolocationPositionError class.
        // Unavailable/timeout errors can recover while the watch remains active.
        if (error.code === 1) finish(undefined, new DealLocationError("permission", "Location access is blocked. Allow location for TeachersVIP, then tap Use Deal again."))
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 })
      // Handles synchronous callbacks from browser adapters/test doubles too.
      if (settled) geolocation.clearWatch(watchId)
    } catch {
      finish(undefined, new DealLocationError("unavailable", "Location services could not start. Open TeachersVIP in Safari or Chrome, check Location Services, and try again."))
    }
  })
}

export function locationDenialMessage(message: string, details?: Record<string, unknown>): string {
  if (!details || !["low_accuracy", "outside_radius"].includes(String(details.reason))) return message
  const accuracy = typeof details.accuracyM === "number" ? Math.ceil(details.accuracyM) : null
  const distance = typeof details.distanceM === "number" ? Math.ceil(details.distanceM) : null
  if (details.reason === "low_accuracy") {
    return `We could not confirm you are inside the participating location’s boundary${accuracy != null ? ` (location accuracy: ±${accuracy} m)` : ""}. Turn on Precise Location, keep Wi-Fi on, and try again near the entrance.`
  }
  return `${message}${distance != null ? ` Your reported location is about ${distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`} from the selected business.` : ""} Check the selected location or use Get Directions.`
}
