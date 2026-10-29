import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, post, del } from './lib/api'
import { OFFER_CTA_LABELS, type OfferCtaType } from '../shared/offer-cta'

const pendingKey = 'teachersvip:pending-interest-offer'
export function pendingOfferDestination() {
  try {
    const value = localStorage.getItem(pendingKey)
    return value && /^\/deals\/[a-z0-9-]+$/.test(value) ? value : '/deals'
  } catch { return '/deals' }
}
function rememberOffer(id: string) {
  try { localStorage.setItem(pendingKey, `/deals/${id}`) } catch { /* Signup remains available. */ }
}

type InterestOffer = { id: string; business_name: string; title: string; description: string; restrictions: string; image_url: string; event_name?: string | null; event_date_time?: string | null; event_location?: string | null; rsvp_id?: string | null; cta_type?: OfferCtaType; interest_submitted?: boolean }

export function OfferInterestDetail({ deal, user }: { deal: InterestOffer; user: { verified: boolean; is_demo?: boolean } | null }) {
  const [submitted, setSubmitted] = useState(Boolean(deal.interest_submitted))
  const [rsvpId, setRsvpId] = useState(deal.rsvp_id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false)
  const confirmationRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setSubmitted(Boolean(deal.interest_submitted)); setRsvpId(deal.rsvp_id); setError(''); setConfirmationEmailSent(false) }, [deal.id, deal.interest_submitted, deal.rsvp_id])
  useEffect(() => {
    if (submitted) confirmationRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [submitted])
  const label = OFFER_CTA_LABELS[deal.cta_type || 'join_waitlist']
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await post<{ confirmationEmailSent?: boolean; submission: { id: string } }>(`/deals/${encodeURIComponent(deal.id)}/interest`, {})
      setRsvpId(result.submission.id)
      setConfirmationEmailSent(Boolean(result.confirmationEmailSent))
      setSubmitted(true)
      try { localStorage.removeItem(pendingKey) } catch { /* Optional return destination. */ }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <section className="deal-detail interest-offer-detail">
    <div className="deal-detail-media">
      <img src={deal.image_url} alt={deal.business_name} />

    </div>
    <div className="detail-copy">
      <div className="tags"><span>{label}</span></div>
      <h2>{deal.event_name || deal.title}</h2>
      <p>{deal.description}</p>
      <div className="restriction"><b>Event and offer details</b><span>{deal.restrictions}</span></div>
      {deal.cta_type === 'rsvp' && <p><strong>Date and time:</strong> {deal.event_date_time || 'To be announced'}<br /><strong>Location:</strong> {deal.event_location || 'To be announced'}</p>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {submitted ? <div ref={confirmationRef} className="notice notice-success" role="status">
        <strong>{deal.cta_type === 'rsvp' ? 'Thank you for RSVPing!' : deal.cta_type === 'get_launch_invite' ? 'Your launch invite request is saved.' : 'You’re on the waitlist.'}</strong>
        <p>{deal.cta_type === 'rsvp' ? `Your RSVP for ${deal.event_name || deal.title} with ${deal.business_name} is confirmed. We look forward to seeing you!` : `Your interest has been recorded for ${deal.business_name}. You only need to submit once.`}</p>
        {confirmationEmailSent && <p>A confirmation has also been sent to your preferred email.</p>}
        {deal.cta_type === 'rsvp' && rsvpId && <Link className="back-link" to={`/rsvp/${rsvpId}`}>Manage your RSVP</Link>}
      </div> : user?.is_demo ? <p>Demo preview: verified educators can RSVP here and receive an immediate thank-you and confirmation.</p> : user?.verified ? <>
        <p id="interest-consent" className="interest-consent">Clicking {label} shares your member ID, name and email with the TeachersVIP admin team for this event.</p>
      </> : <>
        <p>Sign up and verify your educator eligibility before registering interest.</p>
        {!user && <Link className="back-link" to="/sign-in" onClick={() => rememberOffer(deal.id)}>Already a member? Sign In</Link>}
      </>}
      <div className="deal-sticky-action">
        {submitted ? <span className="action action-gold">{deal.cta_type === 'rsvp' ? 'RSVP confirmed' : 'Interest saved'}</span> : user?.is_demo ? <span className="action action-soft">Read-only preview</span> : user?.verified ?
          <button className="action action-gold" aria-describedby="interest-consent" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving your interest…' : label}</button> :
          <Link className="action action-gold" to={user ? '/verify' : '/create-account'} onClick={() => rememberOffer(deal.id)}>{user ? 'Verify to continue' : `Sign up to ${label}`}</Link>}
      </div>
    </div>
  </section>
}

type ManagedRsvp = { id: string; deal_id: string; event_name: string; business_name: string; event_date_time: string | null; event_location: string | null }
export function ManageRsvp({ user }: { user: { verified: boolean; is_demo?: boolean } | null }) {
  const { id } = useParams()
  const [rsvp, setRsvp] = useState<ManagedRsvp | null>(null)
  const [error, setError] = useState('')
  const [cancelled, setCancelled] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setRsvp(null); setError(''); setCancelled(false); setConfirming(false)
    if (!user?.verified || user.is_demo) return
    const controller = new AbortController()
    api<{ rsvp: ManagedRsvp }>(`/me/rsvps/${encodeURIComponent(id || '')}`, { signal: controller.signal }).then(result => setRsvp(result.rsvp)).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [id, user?.verified, user?.is_demo])
  if (!user) return <><p>Sign in to the account you used to RSVP.</p><Link className="action action-gold" to={`/sign-in?returnTo=${encodeURIComponent(`/rsvp/${id}`)}`}>Sign in to manage your RSVP</Link></>
  if (!user.verified || user.is_demo) return <p>A verified educator account is required to manage an RSVP.</p>
  if (error) return <div className="notice notice-error" role="alert">{error}</div>
  if (!rsvp) return <p>Loading your RSVP…</p>
  const cancel = async () => {
    setBusy(true)
    try { await del(`/me/rsvps/${encodeURIComponent(rsvp.id)}`); setCancelled(true); setConfirming(false) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="form-grid">
    <h2>{rsvp.event_name}</h2>
    <p><strong>Date and time:</strong> {rsvp.event_date_time || 'To be announced'}<br /><strong>Location:</strong> {rsvp.event_location || 'To be announced'}</p>
    {cancelled ? <div className="notice notice-success" role="status">Your RSVP has been cancelled.</div> : <>
      <p>Your RSVP is confirmed. If your plans have changed, you can cancel it below.</p>
      {confirming ? <><p>Cancel your RSVP for this event?</p><button className="action action-danger" disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</button><button className="action action-soft" disabled={busy} onClick={() => setConfirming(false)}>Keep my RSVP</button></> : <button className="action action-soft" onClick={() => setConfirming(true)}>Cancel RSVP</button>}
    </>}
    <Link className="back-link" to={`/deals/${rsvp.deal_id}`}>View event</Link>
  </section>
}

type Submission = { id: string; deal_id: string; cta_type: OfferCtaType; member_id: string; full_name: string; email: string; business_name: string; event_name: string; submitted_at: string }
type InterestData = { submissions: Submission[]; totals: { submissions: number; educators: number }; offers: { id: string; title: string; event_name: string; business_name: string; business_id: string; cta_type: OfferCtaType; interested: number }[]; page: number; pageSize: number }

export function AdminOfferInterests({ invitesOnly = false }: { invitesOnly?: boolean }) {
  const [result, setResult] = useState<{ key: string; data: InterestData } | null>(null)
  const [offers, setOffers] = useState<InterestData['offers']>([])
  const [dealId, setDealId] = useState('')
  const [businessId, setBusinessId] = useState('')
  const ctaFilter: Record<string, string> = invitesOnly ? { ctaType: 'get_launch_invite' } : {}
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const queryKey = new URLSearchParams({ dealId, businessId, ...ctaFilter, page: String(page) }).toString()
  // A response belongs only to the selection that requested it, including
  // the render before the effect for a new selection starts.
  const data = result?.key === queryKey ? result.data : null
  const loading = busy || (!data && !error)
  useEffect(() => {
    let current = true
    const controller = new AbortController()
    setBusy(true); setError('')
    api<InterestData>(`/admin/offer-interests?${queryKey}`, { signal: controller.signal, cache: 'no-store' })
      .then(data => { if (current) { setResult({ key: queryKey, data }); setOffers(data.offers) } })
      .catch(e => { if (current) { setError(e.message); setResult(null) } })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false; controller.abort() }
  }, [queryKey, revision])
  const download = async () => {
    setExporting(true); setError('')
    try {
      const filters = new URLSearchParams(queryKey)
      filters.delete('page'); filters.set('export', 'csv')
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/offer-interests?${filters}`, { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = invitesOnly ? `invite-requests${dealId ? '-' + dealId : businessId ? '-' + businessId : ''}.csv` : 'interested-educators.csv'
      document.body.appendChild(link)
      link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError((e as Error).message) } finally { setExporting(false) }
  }
  return <section className="admin-card admin-table-card offer-interests" aria-busy={loading}>
    <div className="admin-card-heading"><div><h2>{invitesOnly ? "Invite Requests" : "Interested educators"}</h2><p>{invitesOnly ? "Names and emails from Get Launch Invite, kept separately for each business and event. Export a list for follow-up invitations." : "Waitlists, RSVPs and launch invite requests."}</p></div></div>
    <div className="interest-list-tools">
      {invitesOnly && <label className="field"><span>Business</span><select value={businessId} onChange={event => { setBusinessId(event.target.value); setDealId(''); setPage(1) }}>
        <option value="">All businesses</option>
        {[...new Map(offers.map(offer => [offer.business_id, offer.business_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>}
      <label className="field"><span>{invitesOnly ? "Event" : "Business / event"}</span><select value={dealId} onChange={event => { setDealId(event.target.value); setPage(1) }}>
        <option value="">{invitesOnly ? "All launch events" : "All interest offers"}</option>
        {offers.filter(offer => !businessId || offer.business_id === businessId).map(offer => <option key={offer.id} value={offer.id}>{offer.business_name} · {offer.event_name || offer.title} · {offer.interested} interested</option>)}
      </select></label>
      <button className="action action-soft" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh list</button>
      <button className="action action-gold" disabled={loading || exporting || !data?.totals.submissions} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {loading ? <p role="status">Loading interested educators…</p> : data && <>
      <div className="interest-totals"><strong>{data.totals.educators} total interested educators</strong><span>{data.totals.submissions} event submissions</span></div>
      {data.submissions.length ? <div className="interest-table-scroll" tabIndex={0} role="region" aria-label="Interested educators list"><table className="interest-table">
        <thead><tr>{['Member ID', 'Name', 'Email', 'Business', 'Event', 'CTA type', 'Submission date'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.submissions.map(row => <tr key={row.id}><td>{row.member_id}</td><td>{row.full_name}</td><td>{row.email}</td><td>{row.business_name}</td><td>{row.event_name}</td><td>{OFFER_CTA_LABELS[row.cta_type]}</td><td>{new Date(row.submitted_at).toLocaleString()}</td></tr>)}</tbody>
      </table></div> : <p className="admin-empty">No interested educators for this selection yet.</p>}
      {data.totals.submissions > data.pageSize && <div className="interest-pagination"><button className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.totals.submissions / data.pageSize)}</span><button className="action action-soft" disabled={page * data.pageSize >= data.totals.submissions} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </>}
  </section>
}
