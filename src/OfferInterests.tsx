import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, post } from './lib/api'
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

type InterestOffer = { id: string; business_name: string; title: string; description: string; restrictions: string; image_url: string; event_name?: string | null; cta_type?: OfferCtaType; interest_submitted?: boolean }

export function OfferInterestDetail({ deal, user }: { deal: InterestOffer; user: { verified: boolean } | null }) {
  const [submitted, setSubmitted] = useState(Boolean(deal.interest_submitted))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setSubmitted(Boolean(deal.interest_submitted)); setError('') }, [deal.id, deal.interest_submitted])
  const label = OFFER_CTA_LABELS[deal.cta_type || 'join_waitlist']
  const submit = async () => {
    setBusy(true); setError('')
    try {
      await post(`/deals/${encodeURIComponent(deal.id)}/interest`, {})
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
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {submitted ? <div className="notice notice-success" role="status">
        <strong>{deal.cta_type === 'rsvp' ? 'Your RSVP is saved.' : deal.cta_type === 'get_launch_invite' ? 'Your launch invite request is saved.' : 'You’re on the waitlist.'}</strong>
        <p>Your interest has been recorded for {deal.business_name}. You only need to submit once.</p>
      </div> : user?.verified ? <>
        <p id="interest-consent" className="interest-consent">Clicking {label} shares your member ID, name and email with the TeachersVIP admin team for this event.</p>
      </> : <>
        <p>Sign up and verify your email before registering interest.</p>
        {!user && <Link className="back-link" to="/sign-in" onClick={() => rememberOffer(deal.id)}>Already a member? Sign In</Link>}
      </>}
      <div className="deal-sticky-action">
        {submitted ? <span className="action action-gold">Interest saved</span> : user?.verified ?
          <button className="action action-gold" aria-describedby="interest-consent" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving your interest…' : label}</button> :
          <Link className="action action-gold" to={user ? '/verify' : '/create-account'} onClick={() => rememberOffer(deal.id)}>{user ? 'Verify to continue' : `Sign up to ${label}`}</Link>}
      </div>
    </div>
  </section>
}

type Submission = { id: string; deal_id: string; cta_type: OfferCtaType; member_id: string; full_name: string; email: string; business_name: string; event_name: string; submitted_at: string }
type InterestData = { submissions: Submission[]; totals: { submissions: number; educators: number }; offers: { id: string; title: string; event_name: string; business_name: string; business_id: string; cta_type: OfferCtaType; interested: number }[]; page: number; pageSize: number }

export function AdminOfferInterests({ invitesOnly = false }: { invitesOnly?: boolean }) {
  const [data, setData] = useState<InterestData | null>(null)
  const [dealId, setDealId] = useState('')
  const [businessId, setBusinessId] = useState('')
  const ctaFilter: Record<string, string> = invitesOnly ? { ctaType: 'get_launch_invite' } : {}
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setBusy(true); setError('')
    api<InterestData>(`/admin/offer-interests?${new URLSearchParams({ dealId, businessId, ...ctaFilter, page: String(page) })}`)
      .then(result => { if (current) setData(result) })
      .catch(e => { if (current) { setError(e.message); setData(null) } })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [dealId, businessId, invitesOnly, page, revision])
  const download = async () => {
    setExporting(true); setError('')
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/offer-interests?${new URLSearchParams({ dealId, businessId, ...ctaFilter, export: 'csv' })}`, { credentials: 'include' })
      if (!response.ok) throw new Error((await response.json()).error || 'Export failed.')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url; link.download = invitesOnly ? `invite-requests${dealId ? '-' + dealId : businessId ? '-' + businessId : ''}.csv` : 'interested-educators.csv'
      document.body.appendChild(link)
      link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { setError((e as Error).message) } finally { setExporting(false) }
  }
  return <section className="admin-card admin-table-card offer-interests" aria-busy={busy}>
    <div className="admin-card-heading"><div><h2>{invitesOnly ? "Invite Requests" : "Interested educators"}</h2><p>{invitesOnly ? "Names and emails from Get Launch Invite, kept separately for each business and event. Export a list for follow-up invitations." : "Waitlists, RSVPs and launch invite requests."}</p></div></div>
    <div className="interest-list-tools">
      {invitesOnly && <label className="field"><span>Business</span><select value={businessId} onChange={event => { setBusinessId(event.target.value); setDealId(''); setPage(1) }}>
        <option value="">All businesses</option>
        {[...new Map(data?.offers.map(offer => [offer.business_id, offer.business_name]) || []).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>}
      <label className="field"><span>{invitesOnly ? "Event" : "Business / event"}</span><select value={dealId} onChange={event => { setDealId(event.target.value); setPage(1) }}>
        <option value="">{invitesOnly ? "All launch events" : "All interest offers"}</option>
        {data?.offers.filter(offer => !businessId || offer.business_id === businessId).map(offer => <option key={offer.id} value={offer.id}>{offer.business_name} · {offer.event_name || offer.title} · {offer.interested} interested</option>)}
      </select></label>
      <button className="action action-soft" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh list</button>
      <button className="action action-gold" disabled={busy || exporting || !data?.totals.submissions} onClick={() => void download()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {busy ? <p role="status">Loading interested educators…</p> : data && <>
      <div className="interest-totals"><strong>{data.totals.educators} total interested educators</strong><span>{data.totals.submissions} event submissions</span></div>
      {data.submissions.length ? <div className="interest-table-scroll" tabIndex={0} role="region" aria-label="Interested educators list"><table className="interest-table">
        <thead><tr>{['Member ID', 'Name', 'Email', 'Business', 'Event', 'CTA type', 'Submission date'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{data.submissions.map(row => <tr key={row.id}><td>{row.member_id}</td><td>{row.full_name}</td><td>{row.email}</td><td>{row.business_name}</td><td>{row.event_name}</td><td>{OFFER_CTA_LABELS[row.cta_type]}</td><td>{new Date(row.submitted_at).toLocaleString()}</td></tr>)}</tbody>
      </table></div> : <p className="admin-empty">No interested educators for this selection yet.</p>}
      {data.totals.submissions > data.pageSize && <div className="interest-pagination"><button className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.totals.submissions / data.pageSize)}</span><button className="action action-soft" disabled={page * data.pageSize >= data.totals.submissions} onClick={() => setPage(value => value + 1)}>Next</button></div>}
    </>}
  </section>
}
