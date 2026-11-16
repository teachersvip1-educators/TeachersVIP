import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, CaretDown, CheckCircle, ForkKnife, MapPin } from "@phosphor-icons/react"
import { api, patch, post } from "./lib/api"
import { DEFAULT_DISCOVER_MARKET, DISCOVER_MARKETS } from "../shared/discover-markets"
import type { CateringListing, CateringRequest } from "../shared/catering"

type CateringMember = {
  is_demo?: boolean
  first_name?: string
  last_name?: string
  personal_email?: string
  work_email?: string | null
  offers_email?: string | null
}
type AdminListing = CateringListing & { quote_email: string; published: boolean }
type Business = { id: string; name: string; published: boolean }
type Catalogue = { businesses: Business[]; listings: AdminListing[] }

const marketStorageKey = "teachersvip-discover-market"
function savedMarket() {
  try { return localStorage.getItem(marketStorageKey) } catch { return null }
}
function rememberMarket(id: string) {
  try { localStorage.setItem(marketStorageKey, id) } catch { /* Browsing remains available. */ }
}
function localDate() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
}
function eventDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function Catering({ user }: { user: CateringMember }) {
  const [params, setParams] = useSearchParams()
  const marketId = params.get("market") || savedMarket()
  const market = DISCOVER_MARKETS.find(item => item.id === marketId) || DEFAULT_DISCOVER_MARKET
  const [result, setResult] = useState<{ market: string; listings: CateringListing[] } | null>(null)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<CateringListing | null>(null)
  const loading = result?.market !== market.id && !error

  useEffect(() => {
    const controller = new AbortController()
    setError("")
    setSelected(null)
    void api<{ listings: CateringListing[] }>(`/catering?market=${encodeURIComponent(market.id)}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ market: market.id, listings: data.listings }) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [market.id, revision])

  const listings = result?.market === market.id ? result.listings : []
  const chooseMarket = (id: string) => {
    rememberMarket(id)
    setResult(null)
    setError("")
    setParams({ market: id })
  }
  return <>
    <Link className="back-link catering-back" to="/deals"><ArrowLeft size={16} /> Back to Discover</Link>
    <section className="catering-intro">
      <span className="catering-eyebrow"><ForkKnife size={18} /> Made for your school community</span>
      <h2>Good food.<br />Better school gatherings.</h2>
      <p>Find participating businesses for staff meals, meetings and school events, with special perks for schools and educators.</p>
      <div className="catering-steps"><span>1. Find a caterer</span><ArrowRight size={15} aria-hidden="true" /><span>2. Request a quote</span><ArrowRight size={15} aria-hidden="true" /><span>3. Plan directly</span></div>
    </section>
    <label className="discover-market-picker">
      <MapPin size={20} aria-hidden="true" />
      <span aria-hidden="true">Catering in <strong>{market.label}</strong></span><CaretDown size={16} aria-hidden="true" />
      <select aria-label="Catering market" value={market.id} onChange={event => chooseMarket(event.target.value)}>
        {DISCOVER_MARKETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
    {error && <div className="notice notice-error" role="alert">{error}<button className="catering-text-button" onClick={() => { setError(""); setResult(null); setRevision(value => value + 1) }}>Try again</button></div>}
    {loading && <div className="catering-loading" role="status">Finding catering partners…</div>}
    {!loading && !error && !listings.length && <section className="catering-empty">
      <span className="catering-empty-icon"><ForkKnife size={32} weight="duotone" /></span>
      <span className="catering-eyebrow">Coming soon</span>
      <h2>Catering partners are on the way in {market.name}.</h2>
      <p>Participating businesses and their school perks will appear here as they join. Check back soon, or help us grow the catering community.</p>
      <Link className="action action-gold" to="/partner">Offer catering through TeachersVIP <ArrowRight size={17} /></Link>
    </section>}
    {!loading && !error && listings.length > 0 && <>
      <div className="section-heading catering-list-heading"><h2>Catering partners in {market.name}</h2><span>{listings.length}</span></div>
      <div className="catering-listings">
        {listings.map(listing => <article className="catering-listing" key={listing.business_id}>
          <img src={listing.image_url} alt="" loading="lazy" />
          <div className="catering-listing-copy">
            <span className="catering-eyebrow">School & educator catering</span><h3>{listing.name}</h3><p>{listing.description}</p>
            <div className="catering-perk"><CheckCircle size={20} weight="fill" /><div><small>Your school perk</small><strong>{listing.perk}</strong></div></div>
            <dl className="catering-facts"><div><dt>Service area</dt><dd>{listing.service_area}</dd></div>
              {listing.minimum_guests != null && <div><dt>Minimum group</dt><dd>{listing.minimum_guests} guests</dd></div>}
              {listing.lead_time && <div><dt>Advance notice</dt><dd>{listing.lead_time}</dd></div>}
              {listing.delivery_options && <div><dt>Delivery / pickup</dt><dd>{listing.delivery_options}</dd></div>}
            </dl>
            <button className="action action-gold" disabled={user.is_demo} onClick={() => setSelected(listing)}>Request a Quote <ArrowRight size={17} /></button>
            {user.is_demo && <small className="catering-muted">Read-only preview. Verified educators can request quotes.</small>}
          </div>
        </article>)}
      </div>
      <p className="catering-disclaimer">Each business confirms its availability, pricing and perk terms directly. A quote request does not place an order.</p>
    </>}
    {selected && !user.is_demo && <QuoteForm key={selected.business_id} listing={selected} user={user} onClose={() => setSelected(null)} />}
  </>
}

function QuoteForm({ listing, user, onClose }: { listing: CateringListing; user: CateringMember; onClose: () => void }) {
  const section = useRef<HTMLElement>(null)
  const requestKey = useRef(crypto.randomUUID())
  const attemptedPayload = useRef("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ request: { id: string; status: string }; notificationSent: boolean } | null>(null)
  useEffect(() => {
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    section.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true })
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (key: string) => String(data.get(key) || "").trim()
    setBusy(true); setError("")
    try {
      const payload = {
        contactName: text("contactName"), contactEmail: text("contactEmail"), contactPhone: text("contactPhone"),
        schoolName: text("schoolName"), eventType: text("eventType"), eventDate: text("eventDate"), eventTime: text("eventTime"), guestCount: Number(data.get("guestCount")),
        budget: text("budget"), deliveryAddress: text("deliveryAddress"), dietaryRequirements: text("dietaryRequirements"), notes: text("notes"), consent: data.get("consent") === "on",
      }
      const fingerprint = JSON.stringify(payload)
      if (attemptedPayload.current && attemptedPayload.current !== fingerprint) requestKey.current = crypto.randomUUID()
      attemptedPayload.current = fingerprint
      const response = await post<{ request: { id: string; status: string }; notificationSent: boolean }>(`/catering/${encodeURIComponent(listing.business_id)}/requests`, { ...payload, requestKey: requestKey.current })
      setResult(response)
      section.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <section className="catering-quote admin-card" ref={section} aria-labelledby="quote-heading">
    <div className="catering-section-header"><div><span className="catering-eyebrow">Your next gathering</span><h2 id="quote-heading" tabIndex={-1}>Request a quote from {listing.name}</h2></div><button type="button" className="catering-text-button" onClick={onClose}>Close</button></div>
    {result ? <div className="catering-success" role="status"><CheckCircle size={40} weight="duotone" /><h3>Your quote request is saved.</h3>
      <p>{result.notificationSent ? `${listing.name} has been notified and can contact you about availability and pricing.` : "Your request is saved for the TeachersVIP team to follow up with the business."}</p>
      <p>This is an enquiry. Your catering is confirmed only when you arrange it with the business.</p>
      <small>Request reference: {result.request.id}</small><button className="action action-soft" onClick={onClose}>Back to catering partners</button></div> : <>
      <p className="catering-muted">Share a few details so the business can prepare a quote. Availability and the educator perk are confirmed directly with the business.</p>
      <form className="form-grid" onSubmit={event => void submit(event)}>
        <fieldset disabled={busy} className="catering-fieldset">
          <legend>Your contact details</legend>
          <div className="two"><label className="field"><span>Contact name</span><input name="contactName" autoComplete="name" defaultValue={`${user.first_name || ""} ${user.last_name || ""}`.trim()} maxLength={150} required /></label>
            <label className="field"><span>Contact email</span><input name="contactEmail" type="email" autoComplete="email" defaultValue={user.offers_email || user.work_email || user.personal_email || ""} maxLength={254} required /></label></div>
          <div className="two"><label className="field"><span>Phone <small>(optional)</small></span><input name="contactPhone" type="tel" autoComplete="tel" maxLength={40} /></label>
            <label className="field"><span>School / organization</span><input name="schoolName" autoComplete="organization" maxLength={200} required /></label></div>
        </fieldset>
        <fieldset disabled={busy} className="catering-fieldset">
          <legend>Tell us about your event</legend>
          <div className="two"><label className="field"><span>Event type</span><select name="eventType" required><option value="">Choose an event type</option>{["Staff meal", "Meeting", "School event", "Other"].map(type => <option key={type}>{type}</option>)}</select></label>
            <label className="field"><span>Number of guests{listing.minimum_guests != null && <small> (minimum {listing.minimum_guests})</small>}</span><input name="guestCount" type="number" inputMode="numeric" min={listing.minimum_guests || 1} max={100000} step={1} required /></label></div>
          <div className="two"><label className="field"><span>Event date</span><input name="eventDate" type="date" min={localDate()} required /></label>
            <label className="field"><span>Event time <small>(optional, local to event)</small></span><input name="eventTime" type="time" /></label></div>
          <label className="field"><span>Event location / delivery address</span><input name="deliveryAddress" maxLength={500} placeholder="School name and full address" required /></label>
          <label className="field"><span>Budget <small>(optional)</small></span><input name="budget" maxLength={150} placeholder="Total or per person, including currency" /></label>
          <label className="field"><span>Dietary requirements <small>(optional)</small></span><textarea name="dietaryRequirements" maxLength={2000} placeholder="Allergies, vegetarian options or other needs" /></label>
          <label className="field"><span>Anything else? <small>(optional)</small></span><textarea name="notes" maxLength={4000} placeholder="Meal preferences, setup, delivery or pickup details" /></label>
        </fieldset>
        <label className="check catering-consent"><input type="checkbox" name="consent" required disabled={busy} /><span>I agree to share these event and contact details with {listing.name} and TeachersVIP so they can respond to my quote request.</span></label>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <button className="action action-gold" disabled={busy}>{busy ? "Saving your request…" : "Send Quote Request"}<ArrowRight size={17} /></button>
      </form>
    </>}
  </section>
}

export function AdminCatering() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [requests, setRequests] = useState<CateringRequest[]>([])
  const [selected, setSelected] = useState<AdminListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [updating, setUpdating] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const load = async (signal?: AbortSignal) => {
    const [profiles, quotes] = await Promise.all([api<Catalogue>("/admin/catering", { signal, cache: "no-store" }), api<{ requests: CateringRequest[] }>("/admin/catering-requests", { signal, cache: "no-store" })])
    if (!signal?.aborted) { setCatalogue(profiles); setRequests(quotes.requests) }
  }
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).catch(reason => { if (!controller.signal.aborted) setError(reason.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const edit = (listing: AdminListing | null) => {
    setSelected(listing); setMessage(""); setError("")
    requestAnimationFrame(() => { formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); formRef.current?.querySelector<HTMLSelectElement>("select")?.focus({ preventScroll: true }) })
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (name: string) => String(data.get(name) || "").trim()
    setBusy(true); setError(""); setMessage("")
    try {
      await api(`/admin/catering/${encodeURIComponent(text("businessId"))}`, { method: "PUT", body: JSON.stringify({
        market: text("market"), serviceArea: text("serviceArea"), perk: text("perk"), minimumGuests: text("minimumGuests") ? Number(data.get("minimumGuests")) : null,
        leadTime: text("leadTime"), deliveryOptions: text("deliveryOptions"), quoteEmail: text("quoteEmail"), published: data.get("published") === "on",
      }) })
      await load()
      setMessage("Catering profile saved. Published profiles appear when the business is also published.")
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const changeStatus = async (id: string, status: CateringRequest["status"]) => {
    setUpdating(id); setError("")
    try { await patch(`/admin/catering-requests/${encodeURIComponent(id)}`, { status }); setRequests(rows => rows.map(row => row.id === id ? { ...row, status } : row)) }
    catch (reason) { setError((reason as Error).message) } finally { setUpdating("") }
  }
  return <div className="admin-catering">
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {message && <div className="notice notice-success" role="status">{message}</div>}
    {loading ? <p role="status">Loading catering workspace…</p> : catalogue && <>
      <section className="admin-card catering-profiles">
        <div className="catering-section-header"><div><span className="catering-eyebrow">Participating businesses</span><h2>Catering profiles</h2><p>Add catering to an existing partner without changing its main category.</p></div><button className="action action-soft" onClick={() => edit(null)}>New profile</button></div>
        {catalogue.listings.length ? <div className="catering-profile-list">{catalogue.listings.map(listing => <article key={listing.business_id}><div><strong>{listing.name}</strong><span>{DISCOVER_MARKETS.find(market => market.id === listing.market_id)?.label || listing.market_id} · {listing.published ? "Published" : "Draft"}</span><p>{listing.perk}</p></div><button className="action action-soft" onClick={() => edit(listing)}>Edit</button></article>)}</div> : <p className="catering-muted">No catering profiles yet. Add a business under Business Partners, then set up its catering profile below.</p>}
        <form className="form-grid catering-profile-form" key={selected?.business_id || "new"} ref={formRef} onSubmit={event => void save(event)}>
          <h3>{selected ? `Edit ${selected.name}` : "Add a catering profile"}</h3>
          <fieldset className="catering-fieldset" disabled={busy}>
            <div className="two"><label className="field"><span>Existing business</span><select name="businessId" defaultValue={selected?.business_id || ""} required><option value="">Select a business</option>{catalogue.businesses.map(business => <option key={business.id} value={business.id}>{business.name}{business.published ? "" : " (business hidden)"}</option>)}</select></label>
              <label className="field"><span>Discover market</span><select name="market" defaultValue={selected?.market_id || DEFAULT_DISCOVER_MARKET.id}>{DISCOVER_MARKETS.map(market => <option key={market.id} value={market.id}>{market.label}</option>)}</select></label></div>
            <label className="field"><span>Service area</span><input name="serviceArea" defaultValue={selected?.service_area || ""} placeholder="Cities or neighborhoods served" maxLength={300} required /></label>
            <label className="field"><span>School / educator perk</span><textarea name="perk" defaultValue={selected?.perk || ""} placeholder="The confirmed discount or perk and its terms" maxLength={1000} required /></label>
            <div className="two"><label className="field"><span>Minimum guests <small>(optional)</small></span><input type="number" name="minimumGuests" defaultValue={selected?.minimum_guests ?? ""} min={1} max={100000} step={1} /></label>
              <label className="field"><span>Advance notice <small>(optional)</small></span><input name="leadTime" defaultValue={selected?.lead_time || ""} maxLength={200} placeholder="For example, 48 hours" /></label></div>
            <label className="field"><span>Delivery / pickup options <small>(optional)</small></span><input name="deliveryOptions" defaultValue={selected?.delivery_options || ""} maxLength={500} /></label>
            <label className="field"><span>Quote notification email <small>(required to publish)</small></span><input name="quoteEmail" type="email" defaultValue={selected?.quote_email || ""} maxLength={254} /><small className="field-note">Private. Quote requests are sent here; the address is not shown on the listing.</small></label>
            <label className="check"><input type="checkbox" name="published" defaultChecked={selected?.published || false} /><span>Publish this catering profile<small>The business must also be published under Business Partners.</small></span></label>
          </fieldset>
          <button className="action action-gold" disabled={busy || !catalogue.businesses.length}>{busy ? "Saving profile…" : "Save Catering Profile"}</button>
        </form>
      </section>
      <section className="admin-card catering-requests">
        <div className="catering-section-header"><div><span className="catering-eyebrow">School enquiries</span><h2>Quote requests</h2><p>Latest 200 requests. Follow up with the business and update the status here.</p></div><button className="action action-soft" disabled={busy} onClick={() => { setBusy(true); setError(""); void load().catch(reason => setError(reason.message)).finally(() => setBusy(false)) }}>Refresh</button></div>
        {!requests.length && <p className="catering-muted">No catering quote requests yet.</p>}
        <div className="catering-request-list">{requests.map(request => <article key={request.id} className="catering-request">
          <div className="catering-section-header"><div><span className="catering-eyebrow">{request.business_name}</span><h3>{request.school_name}</h3><p>{request.event_type} · {eventDate(String(request.event_date))}{request.event_time ? ` at ${request.event_time}` : ""} · {request.guest_count} guests</p></div>
            <label className="field"><span>Request status</span><select aria-label={`Status for ${request.school_name}`} value={request.status} disabled={updating === request.id} onChange={event => void changeStatus(request.id, event.target.value as CateringRequest["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="closed">Closed</option></select></label></div>
          <dl className="catering-request-details"><div><dt>Contact</dt><dd>{request.contact_name}<br /><a href={`mailto:${request.contact_email}`}>{request.contact_email}</a>{request.contact_phone && <><br /><a href={`tel:${request.contact_phone}`}>{request.contact_phone}</a></>}</dd></div>
            <div><dt>Event location / delivery</dt><dd>{request.delivery_address}</dd></div>
            {request.budget && <div><dt>Budget</dt><dd>{request.budget}</dd></div>}
            {request.dietary_requirements && <div><dt>Dietary requirements</dt><dd>{request.dietary_requirements}</dd></div>}
            {request.notes && <div><dt>Notes</dt><dd>{request.notes}</dd></div>}
          </dl>
          <footer><span>{request.notification_sent_at ? "Business notification sent" : "Business notification pending — follow up"}</span><small>Received {new Date(request.created_at).toLocaleString()}</small><small>Reference: {request.id}</small></footer>
        </article>)}</div>
      </section>
    </>}
  </div>
}
