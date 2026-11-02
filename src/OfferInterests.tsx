import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, post, del } from './lib/api'
import { OFFER_CTA_LABELS, OFFER_RESPONSE_LABELS, type OfferCtaType } from '../shared/offer-cta'

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
  const isBattersOpening = deal.id === 'batters-brunch-grand-opening'
  const label = isBattersOpening ? 'Receive Your Invitation' : OFFER_CTA_LABELS[deal.cta_type || 'join_waitlist']
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
      <div className="restriction"><b>{isBattersOpening ? 'Educator Soft Opening' : 'Event and offer details'}</b><span>{deal.restrictions}</span></div>
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
        <p>{isBattersOpening ? 'Sign up and verify your educator eligibility to receive the invite.' : 'Sign up and verify your educator eligibility before registering interest.'}</p>
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

export function AdminOfferInterests({ invitesOnly = false, rsvpsOnly = false }: { invitesOnly?: boolean; rsvpsOnly?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<{ key: string; data: InterestData } | null>(null)
  const [offers, setOffers] = useState<InterestData['offers']>([])
  const [selectedDealId, setSelectedDealId] = useState('')
  const dealId = rsvpsOnly ? searchParams.get('dealId') || '' : selectedDealId
  const setDealId = (value: string) => {
    if (!rsvpsOnly) { setSelectedDealId(value); return }
    const next = new URLSearchParams(searchParams)
    if (value) next.set('dealId', value); else next.delete('dealId')
    setSearchParams(next, { replace: true })
  }
  const [businessId, setBusinessId] = useState('')
  const [responseType, setResponseType] = useState('')
  const ctaFilter: Record<string, string> = invitesOnly ? { ctaType: 'get_launch_invite' } : rsvpsOnly ? { scope: 'events', ...(responseType ? { ctaType: responseType } : {}) } : {}
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
      const prefix = rsvpsOnly ? 'event-rsvps' : invitesOnly ? 'invite-requests' : 'interested-educators'
      link.href = url; link.download = `${prefix}${dealId ? '-' + dealId : businessId ? '-' + businessId : ''}.csv`
      document.body.appendChild(link)
      link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError((e as Error).message) } finally { setExporting(false) }
  }
  const selectedOffer = offers.find(offer => offer.id === dealId)
  const columns: { key: keyof Submission; label: string }[] = rsvpsOnly ? [
    { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' },
    { key: 'cta_type', label: 'Response' }, { key: 'event_name', label: 'Event' },
    { key: 'business_name', label: 'Business' }, { key: 'member_id', label: 'Member ID' },
    { key: 'submitted_at', label: 'Submission date' },
  ] : [
    { key: 'member_id', label: 'Member ID' }, { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' }, { key: 'business_name', label: 'Business' },
    { key: 'event_name', label: 'Event' }, { key: 'cta_type', label: 'CTA type' },
    { key: 'submitted_at', label: 'Submission date' },
  ]
  return <section className={`admin-card admin-table-card offer-interests${rsvpsOnly ? ' event-responses' : ''}`} aria-busy={loading}>
    <div className="admin-card-heading"><div>
      <h2>{rsvpsOnly ? 'RSVPs & invitations' : invitesOnly ? 'Invite Requests' : 'Interested educators'}</h2>
      <p>{rsvpsOnly ? 'All saved event responses, past and current, including older waitlist signups. Each response keeps its original status. Creating a TeachersVIP account does not create an RSVP.' : invitesOnly ? 'Names and emails from Get Launch Invite, kept separately for each business and event. Export a list for follow-up invitations.' : 'Waitlists, RSVPs and launch invite requests.'}</p>
      {!rsvpsOnly && <Link className="back-link" to="/admin/rsvps">Open RSVPs & invitations</Link>}
    </div></div>
    {rsvpsOnly && <div className="event-shortcuts" aria-label="Event shortcuts">
      <button type="button" className="action action-soft" aria-pressed={dealId === 'batters-brunch-grand-opening'} onClick={() => { setBusinessId(''); setDealId('batters-brunch-grand-opening'); setPage(1) }}>Batters &amp; Brunch</button>
      {dealId && <button type="button" className="action action-soft" onClick={() => { setBusinessId(''); setDealId(''); setPage(1) }}>All events</button>}
    </div>}
    <div className="interest-list-tools">
      {(invitesOnly || rsvpsOnly) && <label className="field"><span>Business</span><select value={businessId} onChange={event => { setBusinessId(event.target.value); setDealId(''); setPage(1) }}>
        <option value="">All businesses</option>
        {[...new Map(offers.map(offer => [offer.business_id, offer.business_name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>}
      <label className="field"><span>{invitesOnly || rsvpsOnly ? 'Event' : 'Business / event'}</span><select value={dealId} onChange={event => { setDealId(event.target.value); setPage(1) }}>
        <option value="">{rsvpsOnly ? 'All events' : invitesOnly ? 'All launch events' : 'All interest offers'}</option>
        {dealId && !offers.some(offer => offer.id === dealId) && <option value={dealId}>{dealId === 'batters-brunch-grand-opening' ? 'Batters & Brunch · Grand Opening' : 'Selected event'}</option>}
        {offers.filter(offer => !businessId || offer.business_id === businessId).map(offer => <option key={offer.id} value={offer.id}>{offer.business_name} · {offer.event_name || offer.title} · {offer.interested} {rsvpsOnly ? 'responses' : 'interested'}</option>)}
      </select></label>
      {rsvpsOnly && <label className="field"><span>Response</span><select value={responseType} onChange={event => { setResponseType(event.target.value); setPage(1) }}>
        <option value="">All event responses</option>
        <option value="rsvp">RSVP confirmed</option>
        <option value="get_launch_invite">Invitation requested</option>
        <option value="join_waitlist">Waitlist joined</option>
      </select></label>}
      <button type="button" className="action action-soft" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh list</button>
      <button type="button" className="action action-gold" disabled={loading || exporting || !data?.totals.submissions} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
    </div>
    {rsvpsOnly && selectedOffer?.cta_type === 'get_launch_invite' && <div className="notice">This event is collecting invitation requests. An invitation request does not confirm attendance.</div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {loading ? <p role="status">{rsvpsOnly ? 'Loading event responses…' : 'Loading interested educators…'}</p> : data && <>
      <div className="interest-totals" role="status"><strong>{data.totals.educators} {rsvpsOnly ? 'educators responded' : 'total interested educators'}</strong><span>{data.totals.submissions} {rsvpsOnly ? responseType === 'rsvp' ? 'confirmed RSVPs' : responseType === 'get_launch_invite' ? 'invitation requests' : responseType === 'join_waitlist' ? 'waitlist signups' : 'event responses' : 'event submissions'}</span></div>
      {data.submissions.length ? <div className="interest-table-scroll" tabIndex={0} role="region" aria-label={rsvpsOnly ? 'Event responses list' : 'Interested educators list'}><table className="interest-table">
        <thead><tr>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{data.submissions.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key} data-label={column.label}><span>{column.key === 'cta_type' ? (rsvpsOnly ? OFFER_RESPONSE_LABELS : OFFER_CTA_LABELS)[row.cta_type] : column.key === 'submitted_at' ? new Date(row.submitted_at).toLocaleString() : row[column.key]}</span></td>)}</tr>)}</tbody>
      </table></div> : <p className="admin-empty">{rsvpsOnly ? 'No saved event responses match these filters. Responses appear after an educator submits an RSVP, invitation request or event waitlist signup.' : 'No interested educators for this selection yet.'}</p>}
      {data.totals.submissions > data.pageSize && <div className="interest-pagination"><button type="button" className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.totals.submissions / data.pageSize)}</span><button type="button" className="action action-soft" disabled={page * data.pageSize >= data.totals.submissions} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </>}
  </section>
}
