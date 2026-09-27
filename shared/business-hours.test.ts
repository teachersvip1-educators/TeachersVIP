import { describe, expect, it } from "vitest"
import {
  getOpeningStatus,
  isValidTimezone,
  withOpeningStatus,
} from "./business-hours"

describe("business opening hours", () => {
  it("uses business local time and closes exactly at closing time", () => {
    const hours = { mon: [{ open: "09:00", close: "17:00" }] }
    expect(
      getOpeningStatus(
        hours,
        "America/Chicago",
        new Date("2026-09-28T14:00:00Z"),
      ),
    ).toBe(true)
    expect(
      getOpeningStatus(
        hours,
        "America/Chicago",
        new Date("2026-09-28T22:00:00Z"),
      ),
    ).toBe(false)
    expect(
      getOpeningStatus(
        hours,
        "America/Chicago",
        new Date("2026-09-28T13:59:00Z"),
      ),
    ).toBe(false)
  })
  it("handles overnight opening across the Sunday to Monday boundary", () => {
    const hours = { sun: [{ open: "22:00", close: "02:00" }] }
    expect(
      getOpeningStatus(hours, "UTC", new Date("2026-09-27T23:00:00Z")),
    ).toBe(true)
    expect(
      getOpeningStatus(hours, "UTC", new Date("2026-09-28T01:59:00Z")),
    ).toBe(true)
    expect(
      getOpeningStatus(hours, "UTC", new Date("2026-09-28T02:00:00Z")),
    ).toBe(false)
  })
  it("handles split shifts, closed days and daylight savings changes", () => {
    expect(
      getOpeningStatus(
        {
          mon: [
            { open: "09:00", close: "12:00" },
            { open: "14:00", close: "17:00" },
          ],
        },
        "UTC",
        new Date("2026-09-28T13:00:00Z"),
      ),
    ).toBe(false)
    expect(getOpeningStatus({}, "UTC")).toBe(false)
    const hours = { sun: [{ open: "01:00", close: "04:00" }] }
    expect(
      getOpeningStatus(
        hours,
        "America/New_York",
        new Date("2026-11-01T06:30:00Z"),
      ),
    ).toBe(true)
  })
  it("retains legacy status without a schedule and rejects invalid zones", () => {
    expect(getOpeningStatus(null, "UTC")).toBeNull()
    expect(isValidTimezone("Mars/Nowhere")).toBe(false)
    expect(withOpeningStatus({ is_open: true, opening_hours: null })).toEqual({
      is_open: true,
      opening_hours: null,
    })
  })
})
