import { useSyncExternalStore } from "react"
import { getOpeningStatus, type WeeklyHours } from "../../shared/business-hours"

const subscribers = new Set<() => void>()
let currentTime = Date.now()
let timer: number | undefined
function refreshTime() {
  currentTime = Date.now()
  subscribers.forEach((notify) => notify())
}
function onVisibilityChange() {
  if (document.visibilityState === "visible") refreshTime()
}
function subscribe(callback: () => void) {
  subscribers.add(callback)
  if (timer === undefined) {
    currentTime = Date.now()
    timer = window.setInterval(refreshTime, 60000)
    document.addEventListener("visibilitychange", onVisibilityChange)
  }
  return () => {
    subscribers.delete(callback)
    if (!subscribers.size && timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }
}
export function useOpeningStatus(
  business: {
    opening_hours?: WeeklyHours | null
    hours_timezone?: string
    is_open?: boolean | null
  } | null,
) {
  const now = useSyncExternalStore(subscribe, () => currentTime)
  return (
    getOpeningStatus(
      business?.opening_hours,
      business?.hours_timezone || "UTC",
      new Date(now),
    ) ??
    business?.is_open ??
    null
  )
}
