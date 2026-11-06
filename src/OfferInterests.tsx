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

type InterestOffer = { id: string; business_name: string; title: string; description: string; restrictions: string; image_url: string; event_name?: string | null; event_date_time?: string | null; event_location?: string | null; rsvp_id?: string | null; cta_type?: OfferCtaType; interest_submitted?: boolean; confirmed_rsvp_count?: number | null }

export function RsvpCountBadge({ count }: { count?: number | null }) {
  if (count == null) return null
  return <span className="rsvp-count-badge">{count.toLocaleString('en-US')} confirmed {count === 1 ? 'RSVP' : 'RSVPs'}</span>
}

export function OfferInterestDetail({ deal, user }: { deal: InterestOffer; user: { verified: boolean; is_demo?: boolean } | null }) {
  const [submitted, setSubmitted] = useState(Boolean(deal.interest_submitted))
  const [rsvpId, setRsvpId] = useState(deal.rsvp_id)
  const [busy, setBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false)
  const [updatedCount, setUpdatedCount] = useState<{ dealId: string; count: number } | null>(null)
  const confirmationRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setSubmitted(Boolean(deal.interest_submitted)); setRsvpId(deal.rsvp_id); setError(''); setConfirmationEmailSent(false) }, [deal.id, deal.interest_submitted, deal.rsvp_id])
  useEffect(() => {
    if (submitted) confirmationRef.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [submitted])
  const isRsvp = deal.cta_type === 'rsvp'
  const eventReturnTo = `/deals/${encodeURIComponent(deal.id)}`
  const createAccountPath = `/create-account?returnTo=${encodeURIComponent(eventReturnTo)}`
  const signInPath = `/sign-in?returnTo=${encodeURIComponent(eventReturnTo)}`
  const label = OFFER_CTA_LABELS[deal.cta_type || 'join_waitlist']
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await post<{ confirmationEmailSent?: boolean; submission: { id: string } }>(`/deals/${encodeURIComponent(deal.id)}/interest`, {})
      setRsvpId(result.submission.id)
      setConfirmationEmailSent(Boolean(result.confirmationEmailSent))
      setEmailError('')
      setSubmitted(true)
      try { localStorage.removeItem(pendingKey) } catch { /* Optional return destination. */ }
      if (isRsvp) {
        void api<{ deal: InterestOffer }>(eventReturnTo).then(({ deal: refreshedDeal }) => {
          if (refreshedDeal.confirmed_rsvp_count != null)
            setUpdatedCount({ dealId: refreshedDeal.id, count: refreshedDeal.confirmed_rsvp_count })
        }).catch(() => { /* The RSVP is saved even if the count refresh fails. */ })
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const resendConfirmation = async () => {
    if (!rsvpId) return
    setEmailBusy(true); setEmailError('')
    try {
      await post<{ sent: boolean }>(`/me/rsvps/${encodeURIComponent(rsvpId)}/confirmation`, {})
      setConfirmationEmailSent(true)
    } catch (e) {
      setEmailError((e as Error).message)
    } finally { setEmailBusy(false) }
  }
  return <section className="deal-detail interest-offer-detail">
    <div className="deal-detail-media">
      <img src={deal.image_url} alt={deal.business_name} />

    </div>
    <div className="detail-copy">
      <div className="tags"><span>{label}</span></div>
      <h2>{deal.event_name || deal.title}</h2>
      <RsvpCountBadge count={updatedCount?.dealId === deal.id ? updatedCount.count : deal.confirmed_rsvp_count} />
      <p>{deal.description}</p>
      <div className="restriction"><b>{isRsvp ? 'Event RSVP' : 'Event and offer details'}</b><span>{deal.restrictions}</span></div>
      {deal.cta_type === 'rsvp' && <p><strong>Date and time:</strong> {deal.event_date_time || 'To be announced'}<br /><strong>Location:</strong> {deal.event_location || 'To be announced'}</p>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {submitted ? <div ref={confirmationRef} className="notice notice-success" role="status">
        <strong>{deal.cta_type === 'rsvp' ? 'Thank you for RSVPing!' : deal.cta_type === 'get_launch_invite' ? 'Your launch invite request is saved.' : 'You’re on the waitlist.'}</strong>
        <p>{deal.cta_type === 'rsvp' ? `Your RSVP for ${deal.event_name || deal.title} with ${deal.business_name} is confirmed. We look forward to seeing you!` : `Your interest has been recorded for ${deal.business_name}. You only need to submit once.`}</p>
        {deal.cta_type === 'rsvp' && confirmationEmailSent && <p>Your RSVP confirmation email has been sent.</p>}
        {deal.cta_type === 'rsvp' && !confirmationEmailSent && <p>Your RSVP is saved. If the confirmation email did not arrive, you can request it below.</p>}
        {deal.cta_type === 'rsvp' && rsvpId && <button type="button" className="action action-soft" disabled={emailBusy} onClick={() => void resendConfirmation()}>{emailBusy ? 'Sending confirmation…' : confirmationEmailSent ? 'Email me the confirmation again' : 'Email me my RSVP confirmation'}</button>}
        {emailError && <p className="field-error" role="alert">{emailError}</p>}
        {deal.cta_type === 'rsvp' && rsvpId && <Link className="back-link" to={`/rsvp/${rsvpId}`}>Manage your RSVP</Link>}
      </div> : user?.is_demo ? <p>Demo preview: verified educators can RSVP here and receive an immediate thank-you and confirmation.</p> : user?.verified ? <>
        <p id="interest-consent" className="interest-consent">Clicking {label} shares your member ID, name and email with the TeachersVIP admin team for this event.</p>
      </> : <>
        <p>{isRsvp ? 'Sign in or create a free account, verify your educator eligibility, then confirm your RSVP here. You are not added to the RSVP list until you confirm.' : 'Sign up and verify your educator eligibility before registering interest.'}</p>
        {!user && <Link className="back-link" to={signInPath} onClick={() => rememberOffer(deal.id)}>{isRsvp ? 'Already a member? Sign in to register' : 'Already a member? Sign In'}</Link>}
        {!user && isRsvp && <Link className="back-link" to={createAccountPath} onClick={() => rememberOffer(deal.id)}>New to TeachersVIP? Create an account to RSVP</Link>}
      </>}
      <div className="deal-sticky-action">
        {submitted ? <span className="action action-gold">{deal.cta_type === 'rsvp' ? 'RSVP confirmed' : 'Interest saved'}</span> : user?.is_demo ? <span className="action action-soft">Read-only preview</span> : user?.verified ?
          <button className="action action-gold" aria-describedby="interest-consent" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving your interest…' : label}</button> :
          <Link className="action action-gold" to={user ? `/verify?returnTo=${encodeURIComponent(eventReturnTo)}` : createAccountPath} onClick={() => rememberOffer(deal.id)}>{user ? 'Verify to continue' : isRsvp ? 'Sign up to RSVP' : `Sign up to ${label}`}</Link>}
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

type RegistrationOnly = { id: string; full_name: string; email: string; city: string; is_verified: boolean; registered_at: string }
type RegistrationData = { registrations: RegistrationOnly[]; totals: { members: number }; page: number; pageSize: number }

export function AdminUnassignedRegistrations() {
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: RegistrationData } | null>(null)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => { setAppliedSearch(search.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const queryKey = new URLSearchParams({ search: appliedSearch, page: String(page) }).toString()
  const data = result?.key === queryKey && search.trim() === appliedSearch ? result.data : null
  const loading = busy || (!data && !error)
  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setBusy(true); setError('')
    api<RegistrationData>(`/admin/registrations-without-response?${queryKey}`, { signal: controller.signal, cache: 'no-store' })
      .then(data => { if (current) setResult({ key: queryKey, data }) })
      .catch(e => { if (current) { setError(e.message); setResult(null) } })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false; controller.abort() }
  }, [queryKey, revision])
  const download = async () => {
    setExporting(true); setError('')
    try {
      const filters = new URLSearchParams(queryKey)
      filters.delete('page'); filters.set('export', 'csv')
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/registrations-without-response?${filters}`, { credentials: 'include', cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = 'registered-only.csv'
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError((e as Error).message) } finally { setExporting(false) }
  }
  return <section id="registered-only" className="admin-card admin-table-card event-responses" aria-busy={loading}>
    <div className="admin-card-heading"><div>
      <h2>Registered only</h2>
      <p>Members with an account but no saved event response, including older registrations. They are not confirmed attendees and are not assigned to the event selected above.</p>
    </div></div>
    <div className="interest-list-tools">
      <label className="field"><span>Find a registration</span><input type="search" maxLength={150} placeholder="Name or school email" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <button type="button" className="action action-soft" disabled={loading} onClick={() => setRevision(value => value + 1)}>Refresh registrations</button>
      <button type="button" className="action action-gold" disabled={loading || exporting || !data?.totals.members} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Export registrations'}</button>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {loading ? <p role="status">Loading registrations…</p> : data && <>
      <div className="interest-totals" role="status"><strong>{data.totals.members} registered only</strong><span>No saved event response</span></div>
      {data.registrations.length ? <div className="interest-table-scroll" role="region" aria-label="Registered members without an event response" tabIndex={0}><table className="interest-table">
        <thead><tr>{['Name', 'School / account email', 'City', 'Educator eligibility', 'Event response', 'Registration date'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.registrations.map(row => <tr key={row.id}>
          <td data-label="Name"><span>{row.full_name}</span></td>
          <td data-label="School / account email"><span>{row.email}</span></td>
          <td data-label="City"><span>{row.city}</span></td>
          <td data-label="Educator eligibility"><span>{row.is_verified ? 'Verified' : 'Not verified'}</span></td>
          <td data-label="Event response"><span>Registered only</span></td>
          <td data-label="Registration date"><span>{new Date(row.registered_at).toLocaleString()}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="admin-empty">No registrations without an event response match this search.</p>}
      {data.totals.members > data.pageSize && <div className="interest-pagination">
        <button type="button" className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span>Page {page} of {Math.ceil(data.totals.members / data.pageSize)}</span>
        <button type="button" className="action action-soft" disabled={page * data.pageSize >= data.totals.members} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>}
    </>}
  </section>
}

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
  const [responseType, setResponseType] = useState(rsvpsOnly ? 'rsvp' : '')
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
      <h2>{rsvpsOnly ? responseType === 'rsvp' ? 'Confirmed RSVPs' : responseType ? 'Other event responses' : 'All event responses' : invitesOnly ? 'Invite Requests' : 'Interested educators'}</h2>
      <p>{rsvpsOnly ? 'This list defaults to educators who completed and confirmed an RSVP. Invitation requests and waitlist signups are separate response types and never count as confirmed RSVPs. Educator approval is managed under Educators.' : invitesOnly ? 'Names and emails from Get Launch Invite, kept separately for each business and event. Export a list for follow-up invitations.' : 'Waitlists, RSVPs and launch invite requests.'}</p>
      {!rsvpsOnly && <Link className="back-link" to="/admin/rsvps">Open RSVPs & invitations</Link>}
      {rsvpsOnly && <a className="back-link" href="#registered-only">Find a registered member without an event response</a>}
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
      {rsvpsOnly && <label className="field"><span>Response type</span><select value={responseType} onChange={event => { setResponseType(event.target.value); setPage(1) }}>
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
      <div className="interest-totals" role="status"><strong>{data.totals.educators} {rsvpsOnly ? responseType === 'rsvp' ? 'educators RSVP’d' : 'educators responded' : 'total interested educators'}</strong><span>{data.totals.submissions} {rsvpsOnly ? responseType === 'rsvp' ? 'confirmed RSVPs' : responseType === 'get_launch_invite' ? 'invitation requests' : responseType === 'join_waitlist' ? 'waitlist signups' : 'event responses' : 'event submissions'}</span></div>
      {data.submissions.length ? <div className="interest-table-scroll" tabIndex={0} role="region" aria-label={rsvpsOnly ? 'Event responses list' : 'Interested educators list'}><table className="interest-table">
        <thead><tr>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{data.submissions.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key} data-label={column.label}><span>{column.key === 'cta_type' ? (rsvpsOnly ? OFFER_RESPONSE_LABELS : OFFER_CTA_LABELS)[row.cta_type] : column.key === 'submitted_at' ? new Date(row.submitted_at).toLocaleString() : row[column.key]}</span></td>)}</tr>)}</tbody>
      </table></div> : <p className="admin-empty">{rsvpsOnly ? responseType === 'rsvp' ? 'No confirmed RSVPs match these filters yet.' : 'No event responses match these filters yet.' : 'No interested educators for this selection yet.'}</p>}
      {data.totals.submissions > data.pageSize && <div className="interest-pagination"><button type="button" className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.totals.submissions / data.pageSize)}</span><button type="button" className="action action-soft" disabled={page * data.pageSize >= data.totals.submissions} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </>}
  </section>
}
