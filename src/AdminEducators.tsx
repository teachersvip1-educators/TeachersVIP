import { useEffect, useState } from 'react'
import { api } from './lib/api'

type ApprovedEducator = {
  id: string
  full_name: string
  email: string
  member_id: string | null
  city: string
  verified_at: string
}

type EducatorData = {
  educators: ApprovedEducator[]
  totals: { educators: number }
  page: number
  pageSize: number
}

export function AdminApprovedEducators() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<EducatorData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ search: search.trim(), page: String(page) })
    setLoading(true)
    setError('')
    setData(null)
    api<EducatorData>(`/admin/educators?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(e => { if (!controller.signal.aborted) { setData(null); setError(e.message) } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [search, page])

  return <section className="admin-card admin-table-card">
    <div className="admin-card-heading"><div>
      <h2>Approved educator accounts</h2>
      <p>Only members whose educator eligibility is approved appear here. Event RSVPs are listed separately under RSVPs.</p>
    </div></div>
    <div className="interest-list-tools">
      <label className="field"><span>Find an approved educator</span><input type="search" maxLength={150} placeholder="Name, email, member ID or city" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label>
    </div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {loading ? <p role="status">Loading approved educators…</p> : data && <>
      <div className="interest-totals" role="status"><strong>{data.totals.educators} approved educators</strong><span>Educator eligibility confirmed</span></div>
      <div className="admin-table">
        {data.educators.map(educator => <div className="admin-row" key={educator.id}>
          <div>
            <strong>{educator.full_name}</strong>
            <span>{educator.email}</span>
            <span>{educator.member_id ? `Member ID ${educator.member_id} · ` : ''}{educator.city} · Approved {new Date(educator.verified_at).toLocaleDateString()}</span>
          </div>
          <span className="admin-status live">Approved educator</span>
        </div>)}
        {!data.educators.length && <p className="admin-empty">No approved educator accounts match this search.</p>}
      </div>
      {data.totals.educators > data.pageSize && <div className="interest-pagination">
        <button type="button" className="action action-soft" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span>Page {page} of {Math.ceil(data.totals.educators / data.pageSize)}</span>
        <button type="button" className="action action-soft" disabled={page * data.pageSize >= data.totals.educators} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>}
    </>}
  </section>
}
