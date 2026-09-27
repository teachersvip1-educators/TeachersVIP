import { useEffect, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { api } from "./lib/api"
import { focusApiError, validateAdminForm } from "./lib/admin-form"
import { CategorySelect } from "./AdminWorkspace"
import { OFFER_CTA_LABELS, type OfferCtaType } from "../shared/offer-cta"

type Offer = {
  id: string; title: string; description: string; restrictions: string; category: string;
  cta_type: OfferCtaType; event_name: string | null; channel: string; image_url: string | null;
  starts_at: string | null; ends_at: string | null; redemption_method: string | null;
  redemptionValue: string; promoCode: string; display_ttl_seconds: number | null;
  usage_limit_count: number | null; usage_limit_period: string; usage_limit_scope: string;
  tracking_mode: string; estimated_savings_cents: number; locationIds: string[];
  featured: boolean; sponsored: boolean; giveaway: boolean; published: boolean;
}
type Location = { id: string; name: string; address: string | null }
const localDate = (value: string | null) => {
  if (!value) return ""
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16)
}
export function AdminOfferEditor({ id, businessId, locations }: { id: string; businessId: string; locations: Location[] }) {
  const [offer, setOffer] = useState<Offer | null>(null)
  const [cta, setCta] = useState<OfferCtaType>("use_deal")
  const [channel, setChannel] = useState("in_person")
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api<{ deal: Offer }>(`/admin/deals/${encodeURIComponent(id)}`).then(({ deal }) => {
      if (active) { setOffer(deal); setCta(deal.cta_type); setChannel(deal.channel) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [id])
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const invalid = validateAdminForm(form)
    if (invalid) { setError(invalid); return }
    const data = new FormData(form)
    const text = (name: string) => String(data.get(name) || "").trim()
    const date = (name: string) => text(name) ? new Date(text(name)).toISOString() : null
    const useDeal = cta === "use_deal"
    setBusy(true); setError(""); setSaved(false)
    try {
      await api(`/admin/deals/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({
        title: text("title"), description: text("description"), category: text("category"),
        restrictions: text("restrictions"), ctaType: cta, eventName: text("eventName") || null,
        channel, imageUrl: text("imageUrl") || null, startsAt: date("startsAt"), endsAt: date("endsAt"),
        locationIds: data.getAll("locationIds"),
        ...(useDeal ? { redemptionMethod: text("redemptionMethod"), redemptionValue: text("redemptionValue") || null,
          promoCode: text("promoCode") || null, displayTtlSeconds: Number(text("displayMinutes")) * 60,
          usageLimitPeriod: text("usageLimitPeriod"), usageLimitCount: text("usageLimitPeriod") === "none" ? null : Number(text("usageLimitCount")),
          usageLimitScope: text("usageLimitScope"), trackingMode: channel === "online" ? "online" : text("trackingMode"),
          estimatedSavingsCents: Math.round(Number(text("savings")) * 100) } : {}),
        featured: data.has("featured"), sponsored: data.has("sponsored"), giveaway: data.has("giveaway"), published: data.has("published"),
      }) })
      setSaved(true)
    } catch (e) { setError((e as Error).message); focusApiError(form, e) }
    finally { setBusy(false) }
  }
  if (!offer) return <p role={error ? "alert" : "status"}>{error || "Loading offer questions…"}</p>
  const field = (label: string, name: string, value: string | number | null, type = "text", required = false) =>
    <label className="field"><span>{label}</span><input name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value ?? ""} required={required} /></label>
  const select = (label: string, name: string, value: string, values: [string,string][]) =>
    <label className="field"><span>{label}</span><select name={name} defaultValue={value}>{values.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
  return <form className="admin-form admin-offer-edit" onSubmit={save} onChange={() => setSaved(false)} noValidate>
    <h3>Edit offer: {offer.title}</h3>
    <p>Offer ID: {offer.id}. Save updates to this existing offer.</p>
    {field("Offer title", "title", offer.title, "text", true)}
    <label className="field"><span>CTA type</span><select value={cta} onChange={e => setCta(e.target.value as OfferCtaType)}>{Object.entries(OFFER_CTA_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {field("Event name", "eventName", offer.event_name, "text", cta !== "use_deal")}
    <label className="field"><span>Deal description</span><textarea name="description" defaultValue={offer.description} required minLength={5} maxLength={1000} /></label>
    <label className="field"><span>Channel</span><select value={channel} onChange={e => setChannel(e.target.value)}><option value="in_person">In person</option><option value="online">Online</option></select></label>
    <CategorySelect defaultValue={offer.category} />
    <label className="field"><span>Restrictions / event and offer details</span><textarea name="restrictions" defaultValue={offer.restrictions} required minLength={2} maxLength={1000} /></label>
    {field("Offer image URL (blank uses business image)", "imageUrl", offer.image_url)}
    {field("Starts at", "startsAt", localDate(offer.starts_at), "datetime-local")}
    {field("Ends at", "endsAt", localDate(offer.ends_at), "datetime-local")}
    {cta === "use_deal" ? <>
      {channel === "in_person" && <label className="field"><span>Participating locations</span><select name="locationIds" multiple defaultValue={offer.locationIds}>{locations.map(location => <option key={location.id} value={location.id}>{location.name} — {location.address || "Address not specified"}</option>)}</select><small>Select each location that accepts this offer. Each needs coordinates.</small></label>}
      {select("Redemption method", "redemptionMethod", offer.redemption_method || "cashier_instruction", [["cashier_instruction","Cashier instruction"],["pos_button","POS button"],["coupon_code","Coupon code"],["barcode","Barcode"]])}
      {field("Code, barcode value, or cashier instruction", "redemptionValue", offer.redemptionValue)}
      {field("Promo code (online only)", "promoCode", offer.promoCode)}
      {field("Display lifetime (minutes)", "displayMinutes", (offer.display_ttl_seconds || 300) / 60, "number", true)}
      {field("Usage limit", "usageLimitCount", offer.usage_limit_count || 1, "number", true)}
      {select("Usage window", "usageLimitPeriod", offer.usage_limit_period || "none", [["none","Every visit"],["day","Once daily"],["month","Once monthly"],["lifetime","One time only"],["promo","Promotional period"]])}
      {select("Limit scope", "usageLimitScope", offer.usage_limit_scope || "offer", [["offer","Across the offer"],["location","Per location"]])}
      {channel === "in_person" && select("Tracking setup", "trackingMode", offer.tracking_mode === "enhanced_pos" ? "enhanced_pos" : "standard_geolocation", [["standard_geolocation","Standard geolocation"],["enhanced_pos","Enhanced POS tracking"]])}
      {field("Estimated savings ($)", "savings", offer.estimated_savings_cents / 100, "number")}
    </> : <p className="notice">This CTA collects verified educator interest. It does not use geolocation, redemption codes or deal activation limits.</p>}
    {(["featured","sponsored","giveaway","published"] as const).map(name => <label className="check" key={name}><input name={name} type="checkbox" defaultChecked={offer[name]} /><span>{name === "featured" ? "Featured deal" : name === "sponsored" ? "Sponsored placement" : name === "giveaway" ? "Giveaway" : "Published"}</span></label>)}
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    {saved && <p role="status" className="notice notice-success">Offer changes saved.</p>}
    <button type="submit" className="action action-gold" disabled={busy}>{busy ? "Saving…" : "Save Offer Changes"}</button>
    <Link to={`/admin/locations/new?businessId=${encodeURIComponent(businessId)}`}>Add a participating location</Link>
  </form>
}
