export const WEEK_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const
export type WeekDay = typeof WEEK_DAYS[number]
export type WeeklyHours = Partial<Record<WeekDay, {
  open: string
  close: string
}[]>>

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}

/** Closing times earlier than opening times extend into the following day. */
export function getOpeningStatus(
  schedule: WeeklyHours | null | undefined,
  timezone: string,
  now = new Date(),
): boolean | null {
  if (!schedule || !isValidTimezone(timezone)) return null
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || ""
  const day = part("weekday").toLowerCase() as WeekDay
  const minute = Number(part("hour")) * 60 + Number(part("minute"))
  const toMinute = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
  const previous = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7]
  return (
    (schedule[day] || []).some(({ open, close }) => {
      const start = toMinute(open),
        end = toMinute(close)
      return end > start ? minute >= start && minute < end : minute >= start
    }) ||
    (schedule[previous] || []).some(({ open, close }) => {
      const start = toMinute(open),
        end = toMinute(close)
      return end < start && minute < end
    })
  )
}

export function withOpeningStatus<T extends {
  opening_hours?: WeeklyHours | null
  hours_timezone?: string
  is_open?: boolean | null
},>(business: T): T {
  const current = getOpeningStatus(
    business.opening_hours,
    business.hours_timezone || "UTC",
  )
  return current === null ? business : { ...business, is_open: current }
}
