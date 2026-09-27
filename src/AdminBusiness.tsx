import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { api } from "./lib/api"
import { focusApiError, validateAdminForm } from "./lib/admin-form"
import { CategorySelect, WeeklyHoursEditor } from "./AdminWorkspace"
import { WEEK_DAYS, type WeeklyHours } from "../shared/business-hours"

type Business = {
  id: string; name: string; category: string; description: string;
  image_url: string; website_url: string | null; address: string | null;
  distance: string | null; hours: string | null; opening_hours: WeeklyHours | null;
  hours_timezone: string; published: boolean; is_open: boolean | null;
  locations: { id: string; name: string; address: string | null }[];
}
type Offer = { id: string; business_id: string; title: string; published: boolean }

export function AdminBusiness({ id, editing }: { id: string; editing: boolean }) {
  const navigate = useNavigate()
  const [business, setBusiness] = useState<Business | null>(null)
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const url = `/admin/businesses/${encodeURIComponent(id)}`
  useEffect(() => {
    let active = true
    void api<{ businesses: Business[]; deals: Offer[] }>("/admin/overview")
      .then(data => {
        if (!active) return
        const found = data.businesses.find(item => item.id === id)
        setBusiness(found || null)
        setOffers(data.deals.filter(item => item.business_id === id))
        if (!found) setError("Business not found.")
      })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const invalid = validateAdminForm(form)
    if (invalid) { setError(invalid); return }
    const data = new FormData(form)
    const text = (key: string) => String(data.get(key) || "").trim()
    setSaving(true)
    setError("")
    try {
      await api(`/admin/businesses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: text("name"), category: text("category"), description: text("description"),
          imageUrl: text("imageUrl"), websiteUrl: text("websiteUrl") || null,
          address: text("address") || null, distance: text("distance") || null,
          hours: text("hours") || null, timezone: text("timezone"),
          openingHours: JSON.parse(text("openingHours") || "null"),
        }),
      })
      navigate(`${url}?saved=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save business. Please try again.")
      focusApiError(form, e)
    } finally { setSaving(false) }
  }

  return <section className="admin-card admin-business-detail">
    <Link to="/admin/businesses-deals">← Businesses &amp; Deals</Link>
    {loading ? <p role="status">Loading business…</p> : !business ? <p role="alert">{error}</p> : editing ? <>
      <h2>Edit {business.name}</h2>
      <p>Update the business details and weekly hours. Participating locations are managed separately.</p>
      <form className="admin-form" onSubmit={save} noValidate>
        <label className="field"><span>Business name</span><input name="name" required minLength={2} maxLength={140} defaultValue={business.name} /></label>
        <CategorySelect existing={[business.category]} defaultValue={business.category} />
        <label className="field"><span>Description</span><textarea name="description" required minLength={5} maxLength={1000} defaultValue={business.description} /></label>
        <label className="field"><span>Image URL</span><input name="imageUrl" required maxLength={500} defaultValue={business.image_url} /></label>
        <label className="field"><span>Website URL</span><input name="websiteUrl" type="url" defaultValue={business.website_url || ""} /></label>
        <label className="field"><span>Business address</span><input name="address" maxLength={200} defaultValue={business.address || ""} /></label>
        <label className="field"><span>Location / distance label</span><input name="distance" maxLength={120} defaultValue={business.distance || ""} /></label>
        <label className="field"><span>Hours description</span><input name="hours" maxLength={120} defaultValue={business.hours || ""} /></label>
        <label className="field"><span>Timezone</span><input name="timezone" required defaultValue={business.hours_timezone || "America/Chicago"} /></label>
        <WeeklyHoursEditor initial={JSON.stringify(business.opening_hours || null)} initialTimezone={business.hours_timezone} onChange={() => {}} />
        {error && <p role="alert">{error}</p>}
        <div className="admin-row-actions">
          <button className="action action-gold" type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
          <Link className="action action-soft" to={url}>Cancel</Link>
        </div>
      </form>
    </> : <>
      <h2>{business.name}</h2>
      {new URLSearchParams(window.location.search).get("saved") === "1" && <p role="status">Business changes saved.</p>}
      <span className={`admin-status ${business.published ? "live" : ""}`}>{business.published ? "Published" : "Hidden"}</span>
      {business.image_url && <img className="admin-business-image" src={business.image_url} alt={business.name} onError={event => { event.currentTarget.hidden = true }} />}
      <p>{business.category}</p><p>{business.description}</p>
      <p>{business.address || "Address not specified"}</p>
      {business.distance && <p>{business.distance}</p>}
      {business.website_url && /^https?:\/\//i.test(business.website_url) && <a href={business.website_url} target="_blank" rel="noopener noreferrer">Visit business website</a>}
      <h3>Hours</h3>
      <p>{business.hours || "Hours not specified"} · {business.hours_timezone}</p>
      {business.opening_hours && <ul>{WEEK_DAYS.map(day => <li key={day}>{day}: {business.opening_hours![day]?.map(period => `${period.open}–${period.close}`).join(", ") || "Closed"}</li>)}</ul>}
      <div className="admin-row-actions">
        <Link className="action action-gold" to={`${url}/edit`}>Edit</Link>
        <Link className="action action-soft" to={`/admin/locations/new?businessId=${encodeURIComponent(id)}`}>Add Location</Link>
        <Link className="action action-soft" to={`/admin/deals/new?businessId=${encodeURIComponent(id)}`}>Create Deal</Link>
      </div>
      <h3>Participating locations</h3>
      {business.locations.length ? business.locations.map(location => <p key={location.id}><strong>{location.name}</strong><br />{location.address || "Address not specified"}</p>) : <p>No participating locations yet.</p>}
      <h3>Deals</h3>
      {offers.length ? offers.map(offer => <p key={offer.id}>{offer.title} · {offer.published ? "Published" : "Hidden"}</p>) : <p>No deals yet.</p>}
    </>}
  </section>
}
