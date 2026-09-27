import { useEffect, useRef, useState, type FormEvent } from "react"

import { Link, NavLink, useNavigate, useSearchParams } from "react-router-dom"

import {
  ArrowRight,
  ChartBar,
  Envelope,
  House,
  MapPin,
  ShieldCheck,
  Storefront,
  Users,
  Star,
} from "@phosphor-icons/react"

import { api, post } from "./lib/api"

import { focusApiError, validateAdminForm } from "./lib/admin-form"

import { BUSINESS_CATEGORIES } from "../shared/business-categories"

import {
  WEEK_DAYS,
  getOpeningStatus,
  type WeeklyHours,
} from "../shared/business-hours"

export const ADMIN_SECTIONS = [
  {
    path: "overview",
    label: "Overview",
    description: "Membership, offers and recent admin activity",
    icon: House,
  },

  {
    path: "educators",
    label: "Educators",
    description: "Verification requests and approved email domains",
    icon: ShieldCheck,
  },

  {
    path: "businesses-deals",
    label: "Businesses & Deals",
    description: "Businesses, locations, offers and publishing",
    icon: Storefront,
  },

  {
    path: "activity",
    label: "Activity & Analytics",
    description: "Activations, interested educators and platform analytics",
    icon: ChartBar,
  },

  {
    path: "reviews-reports",
    label: "Reviews & Reports",
    description: "Business feedback, comments and report moderation",
    icon: Star,
  },

  {
    path: "creator-network",
    label: "Creator Network",
    description: "Educator creators and collaboration interests",
    icon: Users,
  },

  {
    path: "requests-messages",
    label: "Requests & Messages",
    description: "Partner requests, business suggestions and messages",
    icon: Envelope,
  },
] as const

export function AdminNavigation({ section }: { section?: string }) {
  return (
    <div className="admin-navigation">
      <Link to="/admin" className="admin-home-link">
        <House size={18} /> Admin home
      </Link>
      <nav aria-label="Admin sections">
        {ADMIN_SECTIONS.map((item) => (
          <NavLink
            key={item.path}
            to={`/admin/${item.path}`}
            className={section === item.path ? "active" : undefined}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export function AdminHomeContent() {
  return (
    <>
      <div className="admin-home-intro">
        <span className="admin-eyebrow">YOUR ADMIN WORKSPACE</span>
        <h2>Everything in its place.</h2>
        <p>
          Choose an area to manage TeachersVIP. Add a business or create a deal
          when you are ready.
        </p>
        <div className="admin-primary-actions">
          <Link className="action action-gold" to="/admin/businesses/new">
            Add Business <ArrowRight size={17} />
          </Link>
          <Link className="action action-soft" to="/admin/deals/new">
            Create Deal <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <nav className="admin-home-grid" aria-label="TeachersVIP Admin">
        {ADMIN_SECTIONS.map(
          ({ path, label, description, icon: Icon }, index) => (
            <Link className="admin-home-tile" key={path} to={`/admin/${path}`}>
              <span className="admin-tile-icon">
                <Icon size={25} weight="duotone" />
              </span>
              <div>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{label}</strong>
                <p>{description}</p>
              </div>
              <ArrowRight size={19} />
            </Link>
          ),
        )}
      </nav>
    </>
  )
}

export function CategorySelect({
  existing = [],
  name = "category",
  label = "Category",
  defaultValue = "",
}: {
  existing?: string[]
  name?: string
  label?: string
  defaultValue?: string
}) {
  const options = [
    ...new Set([
      ...BUSINESS_CATEGORIES,
      ...existing.filter(Boolean),
      ...(defaultValue ? [defaultValue] : []),
    ]),
  ]

  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} required defaultValue={defaultValue}>
        <option value="" disabled>
          Select a category
        </option>
        {options.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>
  )
}

export function readDraft(key: string): Record<string, any> {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "{}")
  } catch {
    return {}
  }
}

export function WeeklyHoursEditor({
  initial,
  initialTimezone,
  onChange,
}: {
  initial?: string
  initialTimezone?: string
  onChange: () => void
}) {
  const initialHours = (() => {
    try {
      return JSON.parse(initial || "null") as WeeklyHours | null
    } catch {
      return null
    }
  })()

  const [enabled, setEnabled] = useState(
    initial === undefined || Boolean(initialHours),
  )

  const [schedule, setSchedule] = useState<WeeklyHours>(initialHours || {})

  const [timezone, setTimezone] = useState(initialTimezone || "America/Chicago")

  const [now, setNow] = useState(new Date())

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const form = ref.current?.closest("form")
    const sync = () =>
      setTimezone(String(new FormData(form!).get("timezone") || "UTC"))
    if (form) {
      const timer = window.setTimeout(sync, 0)
      form.addEventListener("change", sync)
      return () => {
        window.clearTimeout(timer)
        form.removeEventListener("change", sync)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(onChange, 0)
    return () => window.clearTimeout(timer)
  }, [enabled, schedule])

  const open = enabled ? getOpeningStatus(schedule, timezone, now) : null

  return (
    <div className="admin-hours-editor" ref={ref}>
      <input
        type="hidden"
        name="openingHours"
        value={enabled ? JSON.stringify(schedule) : "null"}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>Automatically set Open / Closed from weekly hours</span>
      </label>
      {enabled ? (
        <>
          <p className="field-note">
            Times use the location timezone. Leave a day unchecked when closed.
            A closing time before opening continues into the next day.
          </p>
          <div className="admin-hours-status" role="status">
            Current status:{" "}
            <strong>
              {open === null ? "Check timezone" : open ? "Open" : "Closed"}
            </strong>{" "}
            · {timezone}
          </div>
          <div className="admin-hours-days">
            {WEEK_DAYS.map((day) => (
              <div className="admin-hours-day" key={day}>
                <label className="check">
                  <input
                    aria-label={`Open on ${day}`}
                    type="checkbox"
                    checked={Boolean(schedule[day]?.length)}
                    onChange={(event) =>
                      setSchedule((current) => ({
                        ...current,
                        [day]: event.target.checked
                          ? [{ open: "09:00", close: "17:00" }]
                          : [],
                      }))
                    }
                  />
                  <span>{day}</span>
                </label>
                {schedule[day]?.length ? (
                  <>
                    <label>
                      <span>Opens</span>
                      <input
                        aria-label={`${day} opening time`}
                        type="time"
                        required
                        value={schedule[day]![0].open}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            [day]: [
                              { ...current[day]![0], open: event.target.value },
                            ],
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Closes</span>
                      <input
                        aria-label={`${day} closing time`}
                        type="time"
                        required
                        value={schedule[day]![0].close}
                        onChange={(event) =>
                          setSchedule((current) => ({
                            ...current,
                            [day]: [
                              {
                                ...current[day]![0],
                                close: event.target.value,
                              },
                            ],
                          }))
                        }
                      />
                    </label>
                  </>
                ) : (
                  <span className="field-note">Closed</span>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="two">
          <label className="field">
            <span>Hours description</span>
            <input
              name="hours"
              placeholder="Hours available on the business website"
            />
          </label>
          <label className="field">
            <span>Open status (manual fallback)</span>
            <select name="isOpen" defaultValue="">
              <option value="">Unknown</option>
              <option value="true">Open</option>
              <option value="false">Closed</option>
            </select>
          </label>
        </div>
      )}
    </div>
  )
}

type LocationRecord = {
  id: string
  name: string
  address?: string
  latitude: number | null
  longitude: number | null
}

export function AddLocationContent() {
  const [params] = useSearchParams(),
    navigate = useNavigate()

  const businessId = params.get("businessId") || ""

  const returnTo =
    params.get("returnTo") === "/admin/deals/new"
      ? `/admin/deals/new?businessId=${encodeURIComponent(businessId)}`
      : "/admin/businesses-deals"

  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>(
      [],
    ),
    [locations, setLocations] = useState<LocationRecord[]>([]),
    [selected, setSelected] = useState(businessId),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)

  useEffect(() => {
    void api<{ businesses: typeof businesses }>("/admin/overview")
      .then((result) => setBusinesses(result.businesses))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (selected)
      void api<{ locations: LocationRecord[] }>(
        `/admin/businesses/${encodeURIComponent(selected)}/locations`,
      )
        .then((result) => setLocations(result.locations))
        .catch((e) => setError(e.message))
    else setLocations([])
  }, [selected])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget,
      validation = validateAdminForm(form)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError("")
    const data = new FormData(form)
    try {
      await post(
        `/admin/businesses/${encodeURIComponent(selected)}/locations`,
        {
          name: data.get("name"),
          address: data.get("address") || null,
          timezone: data.get("timezone"),
          radiusMeters: Number(data.get("radiusMeters")),
          latitude: data.get("latitude") ? Number(data.get("latitude")) : null,
          longitude: data.get("longitude")
            ? Number(data.get("longitude"))
            : null,
        },
      )
      navigate(
        params.get("returnTo") === "/admin/deals/new"
          ? `/admin/deals/new?businessId=${encodeURIComponent(selected)}`
          : "/admin/businesses-deals",
        { state: { notice: "Location added successfully." } },
      )
    } catch (e) {
      setError((e as Error).message)
      focusApiError(form, e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="admin-screen-help">
        Add a participating branch for a business. Coordinates are optional
        here. Supply both together when available; on-site Use Deal verification
        needs both coordinates.
      </p>
      <Link className="admin-back-link" to={returnTo}>
        ←{" "}
        {params.get("returnTo") === "/admin/deals/new"
          ? "Back to deal draft"
          : "Back to Businesses"}
      </Link>
      <section className="admin-forms admin-single-form">
        <form className="admin-card form-grid" noValidate onSubmit={submit}>
          <div className="admin-card-heading">
            <MapPin size={23} />
            <div>
              <h2>Location details</h2>
              <p>Keep each participating branch under the same business.</p>
            </div>
          </div>
          <label className="field">
            <span>Business</span>
            <select
              required
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="" disabled>
                Select a business
              </option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <Link to="/admin/businesses/new">Add Business</Link>
          <label className="field">
            <span>Location name</span>
            <input name="name" required minLength={2} maxLength={140} />
          </label>
          <label className="field">
            <span>Address</span>
            <input name="address" maxLength={200} />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input name="timezone" required defaultValue="America/Chicago" />
          </label>
          <div className="three">
            <label className="field">
              <span>Latitude (optional)</span>
              <input
                name="latitude"
                type="number"
                min={-90}
                max={90}
                step="any"
              />
            </label>
            <label className="field">
              <span>Longitude (optional)</span>
              <input
                name="longitude"
                type="number"
                min={-180}
                max={180}
                step="any"
              />
            </label>
            <label className="field">
              <span>Radius (meters)</span>
              <input
                name="radiusMeters"
                required
                type="number"
                min={25}
                max={5000}
                defaultValue={150}
              />
            </label>
          </div>
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <button className="action action-gold" disabled={busy}>
            {busy ? "Saving…" : "Add Location"}
          </button>
        </form>
      </section>
      {locations.length > 0 && (
        <section className="admin-card admin-table-card">
          <h2>Existing locations</h2>
          {locations.map((location) => (
            <p key={location.id}>
              <strong>{location.name}</strong> ·{" "}
              {location.address || "No address"}
            </p>
          ))}
        </section>
      )}
    </>
  )
}
