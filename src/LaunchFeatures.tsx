import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { api, patch, post } from "./lib/api"

export function AnimatedSurface({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return <section className={`launch-enter ${className}`}>{children}</section>
}

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Website footer">
      <Link to="/">TeachersVIP · Educator community</Link>
      <nav aria-label="Footer navigation">
        <Link to="/about">About</Link>
        <Link to="/partner">Partner With Us</Link>
        <Link to="/creator-network">Creator Network</Link>
        <Link to="/contact">Contact</Link>
        <Link to="/support">FAQ</Link>
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms</Link>
      </nav>
    </footer>
  )
}

function FeedbackForm({
  title,
  endpoint,
  children,
  values,
}: {
  title: string
  endpoint: string
  children: ReactNode
  values: (form: FormData) => unknown
}) {
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setStatus("")
    try {
      await post(endpoint, values(new FormData(form)))
      setStatus("Submitted. Thank you for helping improve TeachersVIP.")
      form.reset()
    } catch (error) {
      setStatus((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="launch-form" onSubmit={submit}>
      <h3>{title}</h3>
      {children}
      <button className="action action-gold" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Submit"}
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  )
}

export function CityAlert({ city, email }: { city: string; email: string }) {
  const [chosenCity, setChosenCity] = useState(city)
  const [savedCity, setSavedCity] = useState(city)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState("")
  useEffect(() => {
    api<{ alert: { city: string; active: boolean } | null }>("/me/city-alert")
      .then(({ alert }) => {
        if (alert) {
          setChosenCity(alert.city)
          setSavedCity(alert.city)
          setActive(alert.active)
        }
      })
      .catch(() => {})
  }, [])
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus("")
    const nextActive = !active || savedCity !== chosenCity
    try {
      const result = await api<{ deliveryReady: boolean }>("/me/city-alert", {
        method: "PUT",
        body: JSON.stringify({ city: chosenCity, active: nextActive }),
      })
      setActive(nextActive)
      setSavedCity(chosenCity)
      setStatus(
        nextActive
          ? result.deliveryReady
            ? `We'll email ${email} when a new local deal is published for ${chosenCity}.`
            : `Your interest in ${chosenCity} is saved. Email alerts will start when delivery is configured.`
          : "City alerts turned off.",
      )
    } catch (error) {
      setStatus((error as Error).message)
    }
  }
  return (
    <AnimatedSurface className="launch-panel">
      <h2>Notify Me When Deals Arrive</h2>
      <p>Get an email when a new in-person offer is published in your city.</p>
      <form className="launch-inline-form" onSubmit={save}>
        <label>
          City
          <input
            required
            minLength={2}
            maxLength={120}
            value={chosenCity}
            onChange={(event) => setChosenCity(event.target.value)}
          />
        </label>
        <button className="action action-gold" type="submit">
          {active
            ? savedCity === chosenCity
              ? "Turn off alerts"
              : "Update city"
            : "Notify me"}
        </button>
      </form>
      <small>Updates go to {email}.</small>
      {status && <p role="status">{status}</p>}
    </AnimatedSurface>
  )
}

export function SuggestBusiness({ city }: { city: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="suggest-business">
      <button
        className="suggest-business-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close suggestion form" : "Suggest a business"}
      </button>
      {open && (
        <AnimatedSurface className="launch-panel">
          <FeedbackForm
            title="Suggest a Business"
            endpoint="/business-suggestions"
            values={(form) => ({
              businessName: form.get("businessName"),
              city: form.get("city"),
              locationHint: form.get("locationHint"),
              reason: form.get("reason"),
            })}
          >
            <p>Tell us which business you would like to see on TeachersVIP.</p>
            <div className="launch-fields">
              <label>
                Business name
                <input name="businessName" required minLength={2} maxLength={140} />
              </label>
              <label>
                City
                <input
                  name="city"
                  defaultValue={city}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
            </div>
            <label>
              Location or website (optional)
              <input name="locationHint" maxLength={300} />
            </label>
            <label>
              Why this business? (optional)
              <textarea name="reason" maxLength={1000} />
            </label>
          </FeedbackForm>
        </AnimatedSurface>
      )}
    </div>
  )
}

export function OfferReport({ dealId }: { dealId: string }) {
  return (
    <details className="launch-report">
      <summary>Report an Offer</summary>
      <FeedbackForm
        title="Tell us what happened"
        endpoint={`/deals/${encodeURIComponent(dealId)}/issue-reports`}
        values={(form) => ({
          reason: form.get("reason"),
          details: form.get("details"),
        })}
      >
        <label>
          Issue
          <select name="reason" required>
            <option value="expired">Offer expired</option>
            <option value="not_honored">Business would not honor it</option>
            <option value="incorrect_information">Incorrect information</option>
          </select>
        </label>
        <label>
          Details (optional)
          <textarea name="details" maxLength={1500} />
        </label>
      </FeedbackForm>
    </details>
  )
}

export function ReviewTools({ reviewId }: { reviewId: string }) {
  return (
    <div className="review-tools">
      <details>
        <summary>Comment</summary>
        <FeedbackForm
          title="Comment on this review"
          endpoint={`/business-reviews/${reviewId}/comments`}
          values={(form) => ({ body: form.get("body") })}
        >
          <label>
            Your comment
            <textarea name="body" required minLength={2} maxLength={1000} />
          </label>
          <small>Comments appear after moderation.</small>
        </FeedbackForm>
      </details>
      <details>
        <summary>Report Review</summary>
        <FeedbackForm
          title="Report this review"
          endpoint={`/business-reviews/${reviewId}/reports`}
          values={(form) => ({
            reason: form.get("reason"),
            details: form.get("details"),
          })}
        >
          <label>
            Reason
            <select name="reason">
              <option value="spam">Spam</option>
              <option value="abusive">Abusive</option>
              <option value="inaccurate">Inaccurate</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Details (optional)
            <textarea name="details" maxLength={1500} />
          </label>
        </FeedbackForm>
      </details>
    </div>
  )
}

export function ContactPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <main className="public-site">
      <div className="launch-page">
        <h1>Contact TeachersVIP</h1>
        <FeedbackForm
          title="Send a message"
          endpoint="/contact"
          values={(form) => ({
            name: form.get("name"),
            email: form.get("email"),
            message: form.get("message"),
          })}
        >
          <label>
            Name
            <input name="name" required minLength={2} />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Message
            <textarea name="message" required minLength={10} maxLength={2000} />
          </label>
        </FeedbackForm>
      </div>
      {!embedded && <SiteFooter />}
    </main>
  )
}

export function AboutPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <main className="public-site">
      <article className="launch-page">
        <h1>About TeachersVIP</h1>
        <p>
          TeachersVIP is an educator-focused membership and marketing platform
          connecting verified educators with businesses that appreciate and want
          to reach the teacher community. Educators receive exclusive offers and
          opportunities, while businesses gain visibility and build meaningful
          relationships with educators.
        </p>
        <div className="launch-about-grid">
          <section>
            <h2>Educator Membership</h2>
            <p>
              Verified educators discover exclusive local and online offers.
            </p>
            <Link to="/create-account">Explore educator offers</Link>
          </section>
          <section>
            <h2>Business Partnerships</h2>
            <p>
              Businesses reach educators through offers, marketing campaigns,
              events, sponsorships, and community initiatives.
            </p>
            <Link to="/partner">Partner with us</Link>
          </section>
          <section>
            <h2>Teacher Creator Network</h2>
            <p>
              Teacher creators connect with businesses for paid content,
              reviews, promotions, and campaign opportunities.
            </p>
            <Link to="/creator-network">Join the network</Link>
          </section>
        </div>
      </article>
      {!embedded && <SiteFooter />}
    </main>
  )
}

export function UnsubscribePage({ embedded = false }: { embedded?: boolean }) {
  const [params] = useSearchParams()
  const [status, setStatus] = useState("")
  return (
    <main className="public-site">
      <div className="launch-page">
        <h1>City deal alerts</h1>
        <p>Stop receiving emails about new local deals.</p>
        <button
          className="action action-gold"
          onClick={async () => {
            try {
              await post("/city-alerts/unsubscribe", {
                token: params.get("token"),
              })
              setStatus("City alerts have been turned off.")
            } catch (error) {
              setStatus((error as Error).message)
            }
          }}
        >
          Unsubscribe
        </button>
        {status && <p role="status">{status}</p>}
      </div>
      {!embedded && <SiteFooter />}
    </main>
  )
}

export function InformationPage({
  kind,
  embedded = false,
}: {
  kind: "privacy" | "terms"
  embedded?: boolean
}) {
  return (
    <main className="public-site">
      <article className="launch-page">
        <h1>{kind === "privacy" ? "Privacy Policy" : "Terms"}</h1>
        {kind === "privacy" ? (
          <>
            <p>
              TeachersVIP stores account and educator verification details to
              provide membership, offers, and support. When you use an in-person
              offer, we process your device location to check the selected
              business radius and record an activation. Encrypted exact
              coordinates are cleared after the configured audit window;
              activation records and summary metrics remain for reporting.
            </p>
            <p>
              Creator applications, suggestions, reports, reviews, and contact
              messages are available to the TeachersVIP admin team for the
              purposes described when you submit them. Approved reviews and
              comments may appear publicly. City alerts use your account email
              and can be turned off in Discover or through the unsubscribe link
              in each alert.
            </p>
            <p>
              For privacy questions or account data requests, use the{" "}
              <Link to="/contact">contact form</Link>.
            </p>
          </>
        ) : (
          <>
            <p>
              TeachersVIP connects verified educators with participating
              businesses. Offer terms, dates, and limits appear on each deal. A
              successful on-site activation confirms proximity and access to the
              offer; it does not confirm a completed purchase. Businesses apply
              discounts through their normal checkout process.
            </p>
            <p>
              Use accurate account information, respect offer limits, and do not
              misuse location verification, reviews, or reporting tools.
              TeachersVIP may moderate public content and update or remove
              offers that are inaccurate or unavailable.
            </p>
            <p>
              Questions about an offer can be submitted through Report an Offer
              or the <Link to="/contact">contact form</Link>.
            </p>
          </>
        )}
      </article>
      {!embedded && <SiteFooter />}
    </main>
  )
}

type FeedbackData = {
  suggestions: any[]
  offerReports: any[]
  reviewReports: any[]
  comments: any[]
  contacts: any[]
}
type LaunchMetrics = {
  totals: Record<string, number>
  cities: { city: string; signups: number }[]
  viewed: { id: string; title: string; views: number }[]
  saved: { id: string; title: string; saves: number }[]
}
export function AdminLaunchPanel() {
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const [metrics, setMetrics] = useState<LaunchMetrics | null>(null)
  const [error, setError] = useState("")
  const load = () =>
    Promise.all([
      api<FeedbackData>("/admin/launch-feedback"),
      api<LaunchMetrics>("/admin/launch-analytics"),
    ])
      .then(([a, b]) => {
        setFeedback(a)
        setMetrics(b)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    void load()
  }, [])
  const update = async (kind: string, id: string, status: string) => {
    try {
      await patch(`/admin/launch-feedback/${kind}/${id}`, { status })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const updateComment = async (id: string, status: string) => {
    try {
      await patch(`/admin/review-comments/${id}`, { status })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <section className="admin-card launch-admin">
        <h2>Launch analytics</h2>
        {error && <p role="alert">{error}</p>}
        {metrics && (
          <>
            <div className="launch-stat-grid">
              {Object.entries(metrics.totals).map(([key, value]) => (
                <div key={key}>
                  <strong>{value}</strong>
                  <span>{key.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
            <div className="launch-admin-columns">
              <div>
                <h3>Sign-ups by city</h3>
                {metrics.cities.map((x) => (
                  <p key={x.city}>
                    {x.city} · {x.signups}
                  </p>
                ))}
              </div>
              <div>
                <h3>Most-viewed deals</h3>
                {metrics.viewed.map((x) => (
                  <p key={x.id}>
                    {x.title} · {x.views}
                  </p>
                ))}
              </div>
              <div>
                <h3>Most-saved deals</h3>
                {metrics.saved.map((x) => (
                  <p key={x.id}>
                    {x.title} · {x.saves}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
      </section>
      <section className="admin-card launch-admin">
        <h2>Member feedback and leads</h2>
        {feedback && (
          <>
            <h3>Business suggestions</h3>
            {feedback.suggestions.map((x) => (
              <article key={x.id}>
                <strong>
                  {x.business_name} · {x.city}
                </strong>
                <p>
                  {x.location_hint} {x.reason}
                </p>
                <small>
                  {x.educator_email} · {x.status}
                </small>
                <select
                  aria-label={`Status for ${x.business_name}`}
                  value={x.status}
                  onChange={(e) =>
                    void update("suggestion", x.id, e.target.value)
                  }
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="archived">Archived</option>
                </select>
              </article>
            ))}
            <h3>Offer reports</h3>
            {feedback.offerReports.map((x) => (
              <article key={x.id}>
                <strong>
                  {x.title} · {x.reason}
                </strong>
                <p>{x.details}</p>
                <select
                  aria-label={`Status for offer report ${x.id}`}
                  value={x.status}
                  onChange={(e) => void update("offer", x.id, e.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </article>
            ))}
            <h3>Review reports</h3>
            {feedback.reviewReports.map((x) => (
              <article key={x.id}>
                <strong>
                  {x.business_name} · {x.reason}
                </strong>
                <p>{x.review_text}</p>
                <p>{x.details}</p>
                <select
                  aria-label={`Status for review report ${x.id}`}
                  value={x.status}
                  onChange={(e) => void update("review", x.id, e.target.value)}
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </article>
            ))}
            <h3>Review comments</h3>
            {feedback.comments.map((x) => (
              <article key={x.id}>
                <p>{x.body}</p>
                <small>{x.status}</small>
                {x.status !== "rejected" && (
                  <div>
                    {x.status === "pending" && (
                      <button
                        className="action action-gold"
                        onClick={() => void updateComment(x.id, "approved")}
                      >
                        Approve
                      </button>
                    )}
                    <button
                      className="action action-soft"
                      onClick={() => void updateComment(x.id, "rejected")}
                    >
                      {x.status === "approved" ? "Remove" : "Reject"}
                    </button>
                  </div>
                )}
              </article>
            ))}
            <h3>Contact messages</h3>
            {feedback.contacts.map((x) => (
              <article key={x.id}>
                <strong>
                  {x.name} · {x.email}
                </strong>
                <p>{x.message}</p>
              </article>
            ))}
          </>
        )}
      </section>
    </>
  )
}
