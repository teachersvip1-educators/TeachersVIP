import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import {
  ArrowRight,
  BookmarkSimple,
  Buildings,
  CheckCircle,
  Clock,
  Compass,
  Copy,
  Heart,
  IdentificationCard,
  MagnifyingGlass,
  MapPin,
  Question,
  ShieldCheck,
  Storefront,
  Tag,
  UserCircle,
} from "@phosphor-icons/react"
import { api, del, patch, post } from "./lib/api"

type SessionUser = {
  id: string
  personal_email: string
  first_name: string
  last_name: string
  city: string
  work_email: string | null
  verified: boolean
  verification_status?: string | null
  is_superadmin: boolean
}
type RefreshSession = () => Promise<SessionUser | null>
type Profile = SessionUser & {
  mobile: string | null
  sms_consent: boolean
  email_updates: boolean
  educator_verified_at: string | null
  member_id: string
  estimated_savings_cents: number
  reported_uses: number
}
type DealLocation = {
  id: string
  name?: string
  address: string
  latitude: number | null
  longitude: number | null
  radiusMeters?: number
  timezone?: string
}
type Activation = {
  id?: string
  activationType?: "verified_on_site" | "online_offer_access"
  status?: string
  businessName?: string
  locationName?: string
  locationAddress?: string
  offer?: string
  redemptionMethod?: "pos_button" | "coupon_code" | "barcode" | "cashier_instruction"
  redemptionValue?: string | null
  cashierInstruction?: string | null
  barcodeValue?: string | null
  expiresAt?: string
  serverTime?: string
  note?: string
  estimatedSavingsCents?: number
}
type Deal = {
  id: string
  title: string
  description: string
  channel: "in_person" | "online"
  category: string
  restrictions: string
  starts_at?: string | null
  ends_at?: string | null
  usage_limit_count?: number | null
  usage_limit_period?: "none" | "day" | "month" | "promo" | "lifetime"
  estimated_savings_cents: number
  featured: boolean
  sponsored: boolean
  giveaway: boolean
  business_id: string
  business_name: string
  business_description: string
  image_url: string
  website_url: string | null
  distance: string | null
  hours: string | null
  is_open: boolean | null
  address: string | null
  latitude: number | null
  longitude: number | null
  locations?: DealLocation[]
  redemptionMethod?: Activation["redemptionMethod"]
  redemptionValue?: string | null
  cashierInstruction?: string | null
  saved?: boolean
  used?: boolean
}
type Card = {
  member_id: string
  teacherName: string
  verified: boolean
  status: string
  walletStatus: "available" | "active" | "failed" | "pending" | "not_configured"
  walletDownloadUrl: string | null
}

const GOLD = "#D4AF37",
  INK = "#0F172A"
const API_BASE = import.meta.env.VITE_API_URL || "/api"
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  )
const LOCAL_IMAGES: Record<string, string> = {
  "island-spice": "/Ember&Oak.jpeg",
  "glow-beauty": "/LuxeTheory.jpeg",
  "cafe-101": "/GoldenHourCoffee.jpeg",
  booknook: "/The Teacher Edit.jpeg",
  "teacher-tech": "/SundaySupply.jpeg",
  "district-social": "/DistrictSocial.jpeg",
  "lounge-social": "/Lounge&Social.jpeg",
  "skyline-auto-spa": "/SkylineAutoSpa.jpeg",
  "vibes-juice-co": "/VibesJuiceCo.jpeg",
}
const DISCOVER_PRIORITY: Record<string, number> = {
  "island-spice": 0,
  "cafe-101": 1,
}
const discoverRank = (deal: Deal) =>
  DISCOVER_PRIORITY[deal.business_id] ??
  (["Dining", "Coffee"].includes(deal.category) ? 2 : 3)

function Logo({ light = false, to = "/deals" }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="TeachersVIP home">
      <img className="brand-mark" src="/teachersvip-logo.png" alt="" />
      <span className="brand-teachers" style={{ color: light ? "#fff" : INK }}>
        Teachers
      </span>
      <span className="brand-vip">VIP</span>
    </Link>
  )
}

function PublicHeader() {
  return (
    <header className="public-header">
      <Logo light to="/" />
      <nav aria-label="Public navigation">
        <Link to="/partner">For Businesses</Link>
        <Link className="public-sign-in" to="/sign-in">Sign In</Link>
      </nav>
    </header>
  )
}

function PublicHome() {
  return (
    <main className="public-site">
      <PublicHeader />
      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-eyebrow">Free educator membership</span>
          <h1>Local &amp; online deals for educators.</h1>
          <p>Verified educators unlock exclusive deals, giveaways and special offers from businesses that value their work.</p>
          <div className="public-hero-actions">
            <Link className="public-primary" to="/create-account">Join Free <ArrowRight size={18} weight="bold" /></Link>
            <Link className="public-secondary" to="/sign-in">Sign In</Link>
          </div>
          <Link className="public-business-link" to="/partner">Are you a business? <strong>Partner With Us</strong></Link>
        </div>
        <div className="public-offers">
          <h2 className="public-offers-heading">Featured Educator Offers</h2>
          <div className="public-collage" role="region" tabIndex={0} aria-label="Examples of TeachersVIP partner offers">
            <figure className="public-collage-main"><img src="/Ember&Oak.jpeg" alt="20% off at Ember and Oak" /></figure>
            <figure><img src="/GoldenHourCoffee.jpeg" alt="Free pastry at Golden Hour Coffee" /></figure>
            <figure><img src="/The Teacher Edit.jpeg" alt="20% off at The Teacher Edit" /></figure>
          </div>
        </div>
      </section>
      <section className="public-proof" aria-label="How TeachersVIP works">
        <div><ShieldCheck size={30} weight="duotone" /><strong>Verify once</strong><span>Confirm the email address you want to use.</span></div>
        <div><Tag size={30} weight="duotone" /><strong>Explore exclusive offers</strong><span>See the exact benefit before you visit.</span></div>
        <div><MapPin size={30} weight="duotone" /><strong>Use deals simply</strong><span>Activate in-person deals on-site or reveal online promo codes.</span></div>
      </section>
    </main>
  )
}

function PublicPartner() {
  return (
    <div className="public-site public-partner-site">
      <PublicHeader />
      <section className="partner-intro">
        <div>
          <span className="public-eyebrow">TeachersVIP partner network</span>
          <h1>Make educators your regulars.</h1>
          <p>Choose your offer, participating locations, redemption method, and usage policy. TeachersVIP reviews every application before it goes live.</p>
        </div>
        <div className="partner-benefits">
          <div><Buildings size={28} weight="duotone" /><strong>You stay in control</strong><span>Set the exact benefit, restrictions, and participating locations.</span></div>
          <div><ShieldCheck size={28} weight="duotone" /><strong>Verified audience</strong><span>Offers are reserved for verified teachers and college professors.</span></div>
          <div><Tag size={28} weight="duotone" /><strong>Clear reporting</strong><span>On-site activations are recorded without claiming a completed purchase.</span></div>
        </div>
      </section>
      <StructuredPartner publicView />
    </div>
  )
}
function Button({
  children,
  variant = "gold",
  type = "button",
  disabled,
  onClick,
}: {
  children: ReactNode
  variant?: "gold" | "navy" | "soft" | "danger"
  type?: "button" | "submit"
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`action action-${variant}`}
    >
      {children}
    </button>
  )
}
function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  minLength,
  min,
  max,
  step,
  readOnly = false,
  inputMode,
}: {
  label: string
  name: string
  type?: string
  required?: boolean
  defaultValue?: string
  placeholder?: string
  minLength?: number
  min?: number
  max?: number
  step?: string
  readOnly?: boolean
  inputMode?: "numeric" | "text" | "email" | "tel" | "url"
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        minLength={minLength}
        min={min}
        max={max}
        step={step}
        readOnly={readOnly}
        inputMode={inputMode}
      />
      {readOnly && (
        <small className="field-note">
          Managed through your account sign-in.
        </small>
      )}
    </label>
  )
}
function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "error" | "success"
  children: ReactNode
}) {
  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  )
}
function AuthFrame({
  children,
  title,
  intro,
}: {
  children: ReactNode
  title: string
  intro: string
}) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Logo light />
        <div className="shield">✓</div>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="auth-content">{children}</div>
        <small className="auth-footer">Free for educators. Always.</small>
      </section>
    </main>
  )
}

type CitySearchResult = {
  id?: string
  label?: string
  name?: string
  displayName?: string
  display_name?: string
  city?: string
  state?: string
  country?: string
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
    state?: string
    country?: string
  }
}

function CityAutocomplete({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false),
    [remoteSuggestions, setRemoteSuggestions] = useState<string[]>([]),
    [searching, setSearching] = useState(false),
    [activeIndex, setActiveIndex] = useState(-1),
    [message, setMessage] = useState("")
  const suggestions = [...new Set(remoteSuggestions)]

  useEffect(() => {
    const query = value.trim()
    if (query.length < 1) {
      setRemoteSuggestions([])
      setSearching(false)
      setMessage("")
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(
          `${API_BASE}/cities?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        )
        if (!response.ok) throw new Error("City search failed")
        const payload = (await response.json()) as {
          cities?: CitySearchResult[]
        }
        const results = payload.cities || []
        const labels = results
          .map((result) => {
            if (result.label) return result.label
            if (result.name)
              return (
                result.displayName ||
                [result.name, result.state, result.country]
                  .filter(Boolean)
                  .join(", ")
              )
            const address = result.address || {}
            const city =
              address.city ||
              address.town ||
              address.village ||
              address.municipality
            if (!city)
              return result.display_name
                ?.split(",")
                .slice(0, 3)
                .join(",")
                .trim()
            return [city, address.state, address.country]
              .filter(Boolean)
              .join(", ")
          })
          .filter((label): label is string => Boolean(label))
        setRemoteSuggestions(labels)
        setMessage(
          labels.length
            ? ""
            : "No matching cities. You can continue with your city as entered.",
        )
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRemoteSuggestions([])
          setMessage(
            "City search is unavailable. You can continue with your city as entered.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  const choose = (city: string) => {
    onChange(city)
    setOpen(false)
    setActiveIndex(-1)
  }
  return (
    <div className="city-autocomplete">
      <label className="field">
        <span>City and province/state</span>
        <input
          name="city"
          value={value}
          required
          minLength={2}
          placeholder="Start typing your city"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="city-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `city-option-${activeIndex}` : undefined
          }
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 160)}
          onChange={(event) => {
            onChange(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((index) =>
                Math.min(index + 1, suggestions.length - 1),
              )
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              setActiveIndex((index) => Math.max(index - 1, 0))
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault()
              choose(suggestions[activeIndex])
            } else if (event.key === "Escape") setOpen(false)
          }}
        />
      </label>
      {open && (suggestions.length > 0 || searching || message) && (
        <div id="city-suggestions" className="city-suggestions" role="listbox">
          {searching && (
            <span className="city-searching">Searching cities…</span>
          )}
          {suggestions.map((city, index) => (
            <button
              type="button"
              id={`city-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={city}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(city)}
            >
              {city}
            </button>
          ))}
          {!searching && message && (
            <span className="city-searching">{message}</span>
          )}
        </div>
      )}
    </div>
  )
}

function Register({ refresh }: { refresh: RefreshSession }) {
  const [city, setCity] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      const result = await post<{ verificationUrl?: string }>(
        "/auth/register",
        {
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          workEmail: data.get("workEmail"),
          schoolEmail: data.get("workEmail"),
          role: data.get("role"),
          roleAttestation: data.get("roleAttestation") === "on",
          mobile: data.get("mobile") || undefined,
          city,
          password: data.get("password"),
          smsConsent: data.get("smsConsent") === "on",
        },
      )
      await refresh()
      const devLink = result.verificationUrl
        ? `?devVerificationUrl=${encodeURIComponent(result.verificationUrl)}`
        : ""
      window.location.assign(`/verify${devLink}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthFrame
      title="Welcome, Educators"
      intro="Create your free TeachersVIP account to access exclusive local deals, perks, and giveaways from businesses that support educators!"
    >
      <form className="form-grid" onSubmit={submit}>
        <div className="two">
          <Field label="First name" name="firstName" required minLength={2} />
          <Field label="Last name" name="lastName" required minLength={2} />
        </div>
        <Field
          label="Email address"
          name="workEmail"
          type="email"
          required
        />
        <label className="field">
          <span>Your role</span>
          <select name="role" required defaultValue="">
            <option value="" disabled>
              Select your role
            </option>
            <option value="K-12 educator">K-12 educator</option>
            <option value="College professor">College professor</option>
          </select>
        </label>
        <label className="check">
          <input name="roleAttestation" type="checkbox" required />
          <span>
            I confirm that I currently work as the selected educator role.
          </span>
        </label>
        <Field label="Mobile number (optional)" name="mobile" type="tel" />
        <CityAutocomplete value={city} onChange={setCity} />
        <Field
          label="Create password"
          name="password"
          type="password"
          required
          minLength={8}
        />
        <label className="check">
          <input name="smsConsent" type="checkbox" />
          <span>
            <b>Send me TeachersVIP updates by text.</b>
            <small>
              By selecting this checkbox, you agree to receive recurring
              automated promotional texts from TeachersVIP. Consent is not
              required to join. Message and data rates may apply. Reply STOP to
              unsubscribe.
            </small>
          </span>
        </label>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Continue to Verification"}
        </Button>
      </form>
      <p className="switch">
        Already have an account? <Link to="/sign-in">Sign In</Link>
      </p>
    </AuthFrame>
  )
}

function AdminRegister({ refresh }: { refresh: RefreshSession }) {
  const [available, setAvailable] = useState<boolean | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    api<{ available: boolean }>("/auth/admin-registration-status")
      .then((result) => setAvailable(result.available))
      .catch(() => setAvailable(false))
  }, [])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      await post("/auth/admin-register", {
        pin: data.get("pin"),
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        email: data.get("email"),
        password: data.get("password"),
        city: data.get("city"),
      })
      await refresh()
      window.location.assign("/admin")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (available === null)
    return (
      <AuthFrame
        title="Admin Setup"
        intro="Checking whether the one-time administrator registration is available…"
      >
        <div className="verification-progress">
          <span className="skeleton line" />
          <span className="skeleton line" />
        </div>
      </AuthFrame>
    )
  if (!available) return <Navigate to="/create-account" replace />
  return (
    <AuthFrame
      title="Set Up Superadmin"
      intro="Create the one administrator account that will manage businesses and deals."
    >
      <form className="form-grid" onSubmit={submit}>
        <div className="two">
          <Field label="First name" name="firstName" required minLength={2} />
          <Field label="Last name" name="lastName" required minLength={2} />
        </div>
        <Field label="Admin email" name="email" type="email" required />
        <Field label="City" name="city" required minLength={2} />
        <Field
          label="Account password"
          name="password"
          type="password"
          required
          minLength={12}
        />
        <Field
          label="Setup PIN"
          name="pin"
          type="password"
          required
          minLength={4}
          inputMode="numeric"
        />
        <p className="field-note">
          Use the current password if this email already has a TeachersVIP
          account. This setup page disappears after the first successful
          registration.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating superadmin…" : "Create Superadmin Account"}
        </Button>
      </form>
      <p className="switch">
        <Link to="/sign-in">Back to Sign In</Link>
      </p>
    </AuthFrame>
  )
}

function SignIn({ refresh }: { refresh: RefreshSession }) {
  const navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      await post("/auth/sign-in", {
        email: data.get("email"),
        password: data.get("password"),
      })
      const nextUser = await refresh()
      navigate(nextUser?.verified ? "/deals" : "/verify")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthFrame
      title="Welcome Back"
      intro="Sign in to your TeachersVIP account."
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="Email address" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required />
        <Link className="dev-link" to="/forgot-password">
          Forgot your password?
        </Link>
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign In"}
        </Button>
      </form>
      <p className="switch">
        New to TeachersVIP? <Link to="/create-account">Create Account</Link>
      </p>
    </AuthFrame>
  )
}

function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [resetUrl, setResetUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const result = await post<{ resetUrl?: string }>(
        "/auth/forgot-password",
        { email },
      )
      setMessage(
        "If an account exists for that email, a reset link has been sent.",
      )
      setResetUrl(result.resetUrl || "")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthFrame
      title="Reset Password"
      intro="Enter your account email and we’ll send a secure password reset link."
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          <span>Email address</span>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        {message && <Notice kind="success">{message}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send Reset Link"}
        </Button>
        {resetUrl && (
          <a className="dev-link" href={resetUrl}>
            Open development reset link
          </a>
        )}
      </form>
      <p className="switch">
        <Link to="/sign-in">Back to Sign In</Link>
      </p>
    </AuthFrame>
  )
}

function ResetPassword() {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const d = new FormData(event.currentTarget)
    try {
      await post("/auth/reset-password", {
        token: params.get("token"),
        password: d.get("password"),
      })
      navigate("/sign-in")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthFrame
      title="Choose a New Password"
      intro="Your new password must be at least 8 characters."
    >
      <form className="form-grid" onSubmit={submit}>
        <Field
          label="New password"
          name="password"
          type="password"
          required
          minLength={8}
        />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save New Password"}
        </Button>
      </form>
      <p className="switch">
        <Link to="/sign-in">Back to Sign In</Link>
      </p>
    </AuthFrame>
  )
}

function Verify({
  user,
  refresh,
}: {
  user: SessionUser
  refresh: RefreshSession
}) {
  const [params] = useSearchParams(),
    navigate = useNavigate(),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [devUrl, setDevUrl] = useState(params.get("devVerificationUrl") || "")
  useEffect(() => {
    const token = params.get("token")
    if (!token) return
    post<{ status: "verified" | "manual_review" }>("/verification/confirm", {
      token,
    })
      .then(async (result) => {
        const nextUser = await refresh()
        if (result.status === "verified" && nextUser?.verified) {
          setMessage("Your email address is verified.")
          setTimeout(() => navigate("/deals"), 900)
        } else
          setMessage(
            "Your email is confirmed. Your educator eligibility is now in manual review; we’ll notify you when a decision is made.",
          )
      })
      .catch((e) => setError(e.message))
  }, [params, navigate, refresh])
  const send = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    try {
      const result = await post<{ ok: boolean, verificationUrl?: string }>(
        "/verification/send",
        {},
      )
      setMessage(
        "A new verification link was sent to your email address.",
      )
      setDevUrl(result.verificationUrl || "")
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Page title="Verify Your Email Address" narrow>
      <div className="verify-panel">
        <div className="shield large">✓</div>
        <p>
          {user.verification_status === "manual_review" ? (
            <>
              Your email ownership is confirmed for{" "}
              <strong>{user.work_email || user.personal_email}</strong>. Your
              educator eligibility is in manual review; shared university,
              personal, and unknown domains are never automatically denied.
            </>
          ) : user.verification_status === "rejected" ? (
            <>
              We could not approve educator eligibility for{" "}
              <strong>{user.work_email || user.personal_email}</strong> based on
              the current evidence. Contact support if your role or institution
              details have changed.
            </>
          ) : (
            <>
              We sent a verification link to{" "}
              <strong>{user.work_email || user.personal_email}</strong>. Open it
              to confirm ownership. Educator-only domain checks can be activated
              later; shared, personal, and unknown domains then go to manual
              review.
            </>
          )}
        </p>
        {message && <Notice kind="success">{message}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {user.verification_status !== "rejected" && (
          <form className="form-grid" onSubmit={send}>
            <Button type="submit">Resend Verification Link</Button>
            {devUrl && (
              <a className="dev-link" href={devUrl}>
                Open verification link
              </a>
            )}
          </form>
        )}
        <small>
          Your email address is used to confirm ownership. Only K-12 educators
          and college professors are eligible for educator benefits.
        </small>
      </div>
    </Page>
  )
}

function PublicVerify() {
  const [params] = useSearchParams(),
    [error, setError] = useState("")
  const token = params.get("token")
  useEffect(() => {
    if (!token) {
      setError("This verification link is incomplete.")
      return
    }
    post<{ status: "verified" | "manual_review" }>("/verification/confirm", {
      token,
    })
      .then((result) =>
        window.location.replace(
          result.status === "verified" ? "/deals" : "/verify",
        ),
      )
      .catch((e) => setError(e.message))
  }, [token])
  return (
    <AuthFrame
      title="Verifying Your Email"
      intro="We’re confirming your educator email and preparing your TeachersVIP account."
    >
      {error ? (
        <>
          <Notice kind="error">{error}</Notice>
          <Link className="action action-gold" to="/sign-in">
            Go to Sign In
          </Link>
        </>
      ) : (
        <div className="verification-progress">
          <span className="skeleton line" />
          <span className="skeleton line" />
          <small>You’ll be taken to Discover Deals automatically.</small>
        </div>
      )}
    </AuthFrame>
  )
}

function Shell({
  user,
  onSignOut,
  children,
}: {
  user: SessionUser
  onSignOut: () => Promise<void>
  children: ReactNode
}) {
  const location = useLocation(),
    links = [
      { to: "/deals", label: "Discover", Icon: Compass },
      { to: "/saved", label: "Saved", Icon: BookmarkSimple },
      { to: "/vip-card", label: "VIP Card", Icon: IdentificationCard },
      { to: "/profile", label: "Profile", Icon: UserCircle },
    ]
  return (
    <div className="app-shell">
      <aside className="desktop-nav">
        <Logo light />
        <nav>
          {links.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}>
              <Icon size={20} weight="duotone" />
              {label}
            </NavLink>
          ))}
          {user.is_superadmin && (
            <NavLink to="/admin">
              <ShieldCheck size={20} weight="duotone" />
              Admin
            </NavLink>
          )}
        </nav>
        <div className="nav-user">
          <span>
            {user.first_name} {user.last_name}
          </span>
          <small>
            {user.is_superadmin
              ? "Superadmin"
              : user.verified
                ? "Verified Educator"
                : "Verification pending"}
          </small>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Logo />
          <span className={`status ${user.verified ? "verified" : ""}`}>
            <ShieldCheck size={14} weight="fill" />
            {user.is_superadmin
              ? "Superadmin"
              : user.verified
                ? "Verified Educator"
                : "Verification pending"}
          </span>
        </header>
        {children}
        <nav className="mobile-nav" aria-label="Primary navigation">
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={`${location.pathname.startsWith(to) ? "active" : ""} ${
                to === "/vip-card" ? "vip-nav" : ""
              }`}
            >
              <span className="nav-icon">
                <Icon
                  size={23}
                  weight={location.pathname.startsWith(to) ? "fill" : "regular"}
                />
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
          {user.is_superadmin && (
            <NavLink
              to="/admin"
              className={location.pathname.startsWith("/admin") ? "active" : ""}
            >
              <span className="nav-icon">
                <ShieldCheck size={23} />
              </span>
              <span>Admin</span>
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  )
}
function Page({
  title,
  children,
  narrow = false,
  action,
}: {
  title: string
  children: ReactNode
  narrow?: boolean
  action?: ReactNode
}) {
  return (
    <main className={`page ${narrow ? "page-narrow" : ""}`}>
      <div className="page-heading">
        <div>
          <span>TeachersVIP</span>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </main>
  )
}

function DealCard({
  deal,
  onSave,
}: {
  deal: Deal
  onSave: (deal: Deal) => void
}) {
  return (
    <article className={`deal-card ${deal.used ? "deal-card-used" : ""}`}>
      <Link
        to={`/deals/${deal.id}`}
        onClick={() =>
          void post("/analytics/events", {
            eventType: "deal_view",
            businessId: deal.business_id,
            dealId: deal.id,
          })
        }
      >
        <div className="deal-image">
          <img
            src={
              deal.giveaway
                ? "/giveaway.jpeg"
                : LOCAL_IMAGES[deal.business_id] || deal.image_url
            }
            alt=""
          />
          <span className="channel">
            {deal.giveaway
              ? "Win"
              : deal.channel === "online"
                ? "Online"
                : "In Person"}
          </span>
          {deal.used ? (
            <span className="used-card-badge">Activated</span>
          ) : (
            deal.sponsored && <span className="sponsored">Sponsored</span>
          )}
        </div>
        <div className="deal-copy">
          <small>
            {deal.used
              ? "Activated offer"
              : deal.giveaway
                ? "Win"
                : deal.category}
          </small>
          <h2>{deal.business_name}</h2>
          <strong>
            {deal.giveaway ? "Enter to Win a Classroom Toolkit" : deal.title}
          </strong>
          <p>
            {deal.used
              ? "Previously activated. Check the offer limits before using it again."
              : deal.giveaway
                ? "Enter for chances to win free meals, experiences, gift cards, and more."
                : deal.description}
          </p>
          <div className="deal-meta">
            {deal.channel === "in_person" ? (
              <>
                <span>
                  <MapPin size={15} weight="fill" />
                  {deal.distance || deal.address || "Local offer"}
                </span>
                {deal.hours && (
                  <span className={deal.is_open === false ? "closed" : "open"}>
                    <Clock size={15} weight="fill" />
                    {deal.hours}
                  </span>
                )}
              </>
            ) : (
              <span>
                <Compass size={15} weight="fill" />
                {deal.giveaway ? "Enter to win" : "Redeem online"}
              </span>
            )}
          </div>
        </div>
      </Link>
      <button
        className={`save ${deal.saved ? "saved" : ""}`}
        aria-label={deal.saved ? "Remove saved deal" : "Save deal"}
        onClick={() => onSave(deal)}
      >
        <Heart size={20} weight={deal.saved ? "fill" : "regular"} />
      </button>
    </article>
  )
}

function Discover() {
  const [deals, setDeals] = useState<Deal[]>([]),
    [q, setQ] = useState(""),
    [category, setCategory] = useState("All"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true)
  const load = () =>
    api<{ deals: Deal[] }>("/deals")
      .then((r) => {
        setDeals(r.deals)
        r.deals.forEach(
          (d) =>
            void post("/analytics/events", {
              eventType: "business_listing_view",
              businessId: d.business_id,
              dealId: d.id,
              idempotencyKey: `view-${d.id}-${new Date().toISOString().slice(0, 10)}`,
            }),
        )
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  useEffect(() => {
    void load()
  }, [])
  const categories = [
      "All",
      "Food & Drink",
      "Shopping",
      "Services",
      "Online",
      "Win",
    ],
    shown = deals.filter((d) => {
      const mapped = d.giveaway
        ? "Win"
        : d.channel === "online"
          ? "Online"
          : ["Dining", "Coffee"].includes(d.category)
            ? "Food & Drink"
            : d.category === "Retail"
              ? "Shopping"
              : d.category
      return (
        (category === "All" || mapped === category) &&
        `${d.title} ${d.business_name}`.toLowerCase().includes(q.toLowerCase())
      )
    }),
    orderedDeals = [...shown].sort((a, b) => discoverRank(a) - discoverRank(b)),
    activeDeals = orderedDeals.filter((d) => !d.used),
    activatedDeals = orderedDeals.filter((d) => d.used)
  const toggle = async (deal: Deal) => {
    try {
      deal.saved
        ? await del(`/deals/${deal.id}/save`)
        : await post(`/deals/${deal.id}/save`)
      setDeals((v) =>
        v.map((d) => (d.id === deal.id ? { ...d, saved: !d.saved } : d)),
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Page title="Discover Deals">
      <section className="hero">
        <div className="hero-copy">
          <span>EXCLUSIVE EDUCATOR PERKS</span>
          <h2>
            Support local.
            <br />
            Save more.
          </h2>
          <p>Browse in-person and online offers made for educators.</p>
        </div>
      </section>
      <div className="discovery-tools">
        <label className="search-wrap">
          <MagnifyingGlass size={20} />
          <input
            aria-label="Search deals"
            placeholder="Search businesses or offers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="chips">
          {categories.map((c) => (
            <button
              className={category === c ? "active" : ""}
              key={c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading ? (
        <DealSkeletons />
      ) : (
        <>
          {activeDeals.length > 0 && (
            <section className="deal-section">
              <div className="section-heading">
                <h2>Available Deals</h2>
                <span>{activeDeals.length}</span>
              </div>
              <section className="deal-grid">
                {activeDeals.map((d) => (
                  <DealCard key={d.id} deal={d} onSave={toggle} />
                ))}
              </section>
            </section>
          )}
          {activatedDeals.length > 0 && (
            <section className="deal-section used-section">
              <div className="section-heading">
                <h2>Activated Offers</h2>
                <span>{activatedDeals.length}</span>
              </div>
              <section className="deal-grid">
                {activatedDeals.map((d) => (
                  <DealCard key={d.id} deal={d} onSave={toggle} />
                ))}
              </section>
            </section>
          )}
        </>
      )}
      {!loading && !shown.length && (
        <Empty
          title="No matching deals"
          text="Try a different search or category."
        />
      )}
      <NewsletterOptIn />
    </Page>
  )
}

function NewsletterOptIn() {
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [error, setError] = useState("")
  return (
    <section className="newsletter">
      <div>
        <span>Never Miss a Teacher Deal</span>
        <p>
          Get new partnerships, deals and giveaways delivered to your inbox.
        </p>
      </div>
      {sent ? (
        <strong>You're on the list.</strong>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            setError("")
            try {
              await post("/newsletter", { email })
              setSent(true)
            } catch (e) {
              setError((e as Error).message)
            }
          }}
        >
          <input
            type="email"
            aria-label="Email address"
            placeholder="Your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button type="submit">Join</button>
        </form>
      )}
      {error && <small className="newsletter-error">{error}</small>}
    </section>
  )
}

const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
}

function BarcodeDisplay({ value }: { value: string }) {
  const encodedValue = value.toUpperCase()
  if (![...encodedValue].every((character) => CODE39[character]))
    return <strong>{value}</strong>
  const modules: { x: number, width: number, bar: boolean }[] = []
  let x = 10
  for (const character of `*${encodedValue}*`) {
    CODE39[character].split("").forEach((widthCode, index) => {
      const width = widthCode === "w" ? 5 : 2
      modules.push({ x, width, bar: index % 2 === 0 })
      x += width
    })
    x += 2
  }
  return (
    <div className="barcode-display" aria-label={`Barcode ${value}`}>
      <svg viewBox={`0 0 ${x + 8} 72`} role="img" preserveAspectRatio="none">
        <title>{`Barcode ${value}`}</title>
        <rect width={x + 8} height="72" fill="#fff" />
        {modules
          .filter((module) => module.bar)
          .map((module, index) => (
            <rect
              key={index}
              x={module.x}
              y="5"
              width={module.width}
              height="58"
              fill="#071426"
            />
          ))}
      </svg>
      <strong>{value}</strong>
    </div>
  )
}

function ActivationDealDetail({ user }: { user: SessionUser }) {
  const { id } = useParams(),
    [deal, setDeal] = useState<Deal | null>(null),
    [locationId, setLocationId] = useState(""),
    [activation, setActivation] = useState<Activation | null>(null),
    [remaining, setRemaining] = useState(""),
    [copied, setCopied] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  useEffect(() => {
    api<{ deal: Deal }>(`/deals/${id}`)
      .then((result) => {
        setDeal(result.deal)
        setLocationId(result.deal.locations?.[0]?.id || "")
      })
      .catch((e) => setError(e.message))
  }, [id])
  useEffect(() => {
    if (!activation?.expiresAt) return
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.floor(
          (new Date(activation.expiresAt as string).getTime() - Date.now()) /
            1000,
        ),
      )
      setRemaining(
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
      )
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [activation?.expiresAt])
  if (error && !deal)
    return (
      <Page title="Deal">
        <Notice kind="error">{error}</Notice>
      </Page>
    )
  if (!deal)
    return (
      <Page title="Deal">
        <DetailSkeleton />
      </Page>
    )
  const locations = deal.locations?.length
    ? deal.locations
    : [
        {
          id: "default",
          address: deal.address || deal.business_name,
          latitude: deal.latitude,
          longitude: deal.longitude,
        },
      ]
  const selectedLocation =
    locations.find((location) => location.id === locationId) || locations[0]
  const directionsQuery =
    selectedLocation.latitude != null && selectedLocation.longitude != null
      ? `${selectedLocation.latitude},${selectedLocation.longitude}`
      : selectedLocation.address || deal.business_name
  const copyPayload = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(
        "The redemption value could not be copied. Press and hold it to copy manually.",
      )
    }
  }
  const activate = async () => {
    if (!user.verified) {
      setError("Verify your email address before activating this offer.")
      return
    }
    setBusy(true)
    setError("")
    const finish = async (
      coords?: GeolocationCoordinates,
      observedAt?: number,
    ) => {
      try {
        const result = await post<Activation>(`/deals/${deal.id}/activate`, {
          locationId:
            deal.channel === "online" ? undefined : selectedLocation.id,
          lat: coords?.latitude,
          lng: coords?.longitude,
          accuracy: coords?.accuracy,
          locationTimestamp: coords
            ? new Date(observedAt ?? Date.now()).toISOString()
            : undefined,
          idempotencyKey: crypto.randomUUID(),
        })
        setActivation(result)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
      }
    }
    if (deal.channel === "online") {
      await finish()
      return
    }
    if (!navigator.geolocation) {
      setBusy(false)
      setError("Allow location access to use this deal.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void finish(position.coords, position.timestamp),
      () => {
        setBusy(false)
        setError("Allow location access to use this deal.")
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 },
    )
  }
  const redemptionValue =
    activation?.redemptionValue || activation?.barcodeValue
  return (
    <Page
      title={deal.business_name}
      action={
        <Link className="back-link" to="/deals">
          Back to deals
        </Link>
      }
    >
      {deal.channel === "in_person" && !activation && (
        <details className="location-requirement location-requirement-top">
          <summary>
            <MapPin size={20} weight="fill" />
            <span>
              <strong>You must be at the location to use this deal</strong>
              <small>Tap to see how location verification works</small>
            </span>
          </summary>
          <p>
            When you tap Use Deal, TeachersVIP checks that you are at the
            selected participating location before unlocking the offer.
          </p>
        </details>
      )}
      <section className="deal-detail">
        <div className="deal-detail-media">
          <img
            src={
              deal.giveaway
                ? "/giveaway.jpeg"
                : LOCAL_IMAGES[deal.business_id] || deal.image_url
            }
            alt={`${deal.business_name} storefront or logo`}
          />
        </div>
        <div className="detail-copy">
          <div className="tags">
            <span>
              {deal.giveaway
                ? "Win"
                : deal.channel === "online"
                  ? "Online"
                  : "In Person"}
            </span>
            <span>{deal.giveaway ? "Enter to win" : deal.category}</span>
          </div>
          <h2>
            {deal.giveaway ? "Enter to Win a Classroom Toolkit" : deal.title}
          </h2>
          <p>
            {deal.giveaway
              ? "Enter for chances to win free meals, experiences, gift cards, and more."
              : deal.business_description}
          </p>
          {deal.channel === "in_person" && locations.length > 0 && (
            <label className="field">
              <span>Choose participating location</span>
              <select
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                {locations.map((location) => (
                  <option value={location.id} key={location.id}>
                    {location.name ? `${location.name} · ` : ""}
                    {location.address}
                  </option>
                ))}
              </select>
            </label>
          )}
          {deal.channel === "in_person" && (
            <p className="business-address">
              {selectedLocation.address}
              {deal.distance ? ` · ${deal.distance}` : ""}
            </p>
          )}
          <div className="restriction">
            <b>Offer details and restrictions</b>
            <span>{deal.description}</span>
            <span>{deal.restrictions}</span>
            <span><strong>Usage:</strong> {deal.usage_limit_period === "none" ? "Every visit" : deal.usage_limit_period === "day" ? "Once daily" : deal.usage_limit_period === "month" ? "Once monthly" : deal.usage_limit_period === "lifetime" ? "One time only" : "Once during the offer period"}</span>
            {deal.ends_at && <span><strong>Expires:</strong> {new Date(deal.ends_at).toLocaleDateString()}</span>}
            {deal.hours && <span><strong>Hours:</strong> {deal.hours}</span>}
          </div>
          {!activation && error && <Notice kind="error">{error}</Notice>}
          {activation ? (
            <section
              className="report-success activation-success"
              role="status"
            >
              <CheckCircle size={42} weight="fill" />
              <div>
                <small>
                  {activation.activationType === "online_offer_access"
                    ? "ONLINE OFFER ACCESS"
                    : "LOCATION VERIFIED"}
                </small>
                <h3>{activation.offer || deal.title}</h3>
                <p>
                  {activation.locationName ||
                    activation.locationAddress ||
                    (deal.channel === "online"
                      ? "Online offer access"
                      : selectedLocation.address)}
                </p>
              </div>
              {redemptionValue && remaining !== "0:00" && (
                <div className="activation-payload">
                  <span>
                    {activation.redemptionMethod === "barcode"
                      ? "Barcode / redemption value"
                      : activation.redemptionMethod === "pos_button"
                        ? "Cashier instruction"
                        : "Limited-time offer code"}
                  </span>
                  {activation.redemptionMethod === "barcode" ? (
                    <BarcodeDisplay value={redemptionValue} />
                  ) : (
                    <strong>{redemptionValue}</strong>
                  )}
                  <button
                    className="copy-payload"
                    onClick={() => void copyPayload(redemptionValue)}
                  >
                    <Copy size={16} />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
              {activation.cashierInstruction && (
                <p className="cashier-instruction">
                  {activation.cashierInstruction}
                </p>
              )}
              <p className="activation-expiry">
                Expires in <strong>{remaining || "…"}</strong>
              </p>
              <p className="activation-note">
                {activation.activationType === "online_offer_access"
                  ? "This online offer access is recorded without geolocation."
                  : "This is a Verified On-Site Deal Activation, not a confirmed purchase."}
              </p>
              {activation.redemptionMethod === "cashier_instruction" && (
                <Link
                  className="action action-soft"
                  to={`/vip-card?deal=${encodeURIComponent(deal.id)}`}
                >
                  <IdentificationCard size={19} />
                  Show VIP Card
                </Link>
              )}
            </section>
          ) : (
            <div className="flow-actions">
              <div className="deal-sticky-action">
                <Button
                  disabled={!user.verified || busy}
                  onClick={() => void activate()}
                >
                  {busy
                    ? deal.channel === "online"
                      ? "Preparing offer…"
                      : "Checking your location…"
                    : deal.channel === "online"
                      ? "Reveal Code"
                      : "Use Deal"}
                </Button>
              </div>
              {deal.channel === "in_person" && (
                <a
                  className="action action-soft"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    void post("/analytics/events", {
                      eventType: "directions_click",
                      businessId: deal.business_id,
                      dealId: deal.id,
                    })
                  }
                >
                  Get Directions
                </a>
              )}
              {deal.website_url && (
                <a
                  className="action action-soft"
                  href={deal.website_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {deal.giveaway
                    ? "Visit Giveaway Page"
                    : deal.channel === "online" ? "Shop Online" : "Visit Business Website"}
                </a>
              )}
            </div>
          )}
          {activation && error && <Notice kind="error">{error}</Notice>}
        </div>
      </section>
    </Page>
  )
}

function Saved() {
  const [deals, setDeals] = useState<Deal[]>([]),
    [loading, setLoading] = useState(true)
  const load = () =>
    api<{ deals: Deal[] }>("/deals?saved=true")
      .then((r) => setDeals(r.deals))
      .finally(() => setLoading(false))
  useEffect(() => {
    void load()
  }, [])
  const remove = async (deal: Deal) => {
    await del(`/deals/${deal.id}/save`)
    await load()
  }
  return (
    <Page title="Saved Deals">
      {loading ? (
        <DealSkeletons count={2} />
      ) : deals.length ? (
        <section className="deal-grid">
          {deals.map((d) => (
            <DealCard key={d.id} deal={{ ...d, saved: true }} onSave={remove} />
          ))}
        </section>
      ) : (
        <Empty
          title="No saved deals yet"
          text="Save a deal to find it here later."
          action={
            <Link className="action action-navy" to="/deals">
              Explore Deals
            </Link>
          }
        />
      )}
    </Page>
  )
}

type LocationDraft = {
  address: string
  name: string
  timezone: string
  radiusMeters: string
}
function StructuredPartner({ publicView = false }: { publicView?: boolean }) {
  const [locations, setLocations] = useState<LocationDraft[]>([
      { name: "Main location", address: "", timezone: "", radiusMeters: "150" },
    ]),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const updateLocation = (
    index: number,
    key: keyof LocationDraft,
    value: string,
  ) =>
    setLocations((current) =>
      current.map((location, locationIndex) =>
        locationIndex === index ? { ...location, [key]: value } : location,
      ),
    )
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      await post("/partner-inquiries", {
        businessName: data.get("businessName"),
        businessEmail: data.get("businessEmail"),
        contactName: data.get("contactName"),
        proposedDeal: data.get("proposedDeal"),
        posSystem: data.get("posSystem"),
        redemptionMethod: data.get("redemptionMethod"),
        redemptionValue: data.get("redemptionValue") || null,
        displayLifetimeMinutes: Number(data.get("displayLifetimeMinutes") || 5),
        usageLimit: data.get("usageLimit"),
        usageLimitWindow: data.get("usageLimitWindow"),
        trackingMode: data.get("trackingMode"),
        locations: locations.map((location) => ({
          ...location,
          radiusMeters: Number(location.radiusMeters || 150),
        })),
      })
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page title={publicView ? "Apply to become a partner" : "Partner With Us"} narrow>
      {sent ? (
        <Empty
          title="Application received"
          text="TeachersVIP will review your locations, redemption setup, and tracking selection before anything is published."
          action={
            <Link className="action action-gold" to={publicView ? "/" : "/profile"}>
              {publicView ? "Back to Home" : "Back to Profile"}
            </Link>
          }
        />
      ) : (
        <form className="partner-card form-grid" onSubmit={submit}>
          <p>
            Tell us about every participating location and how educators will
            access the offer. Our team will validate the details before
            approval.
          </p>
          <div className="two">
            <Field label="Business name" name="businessName" required />
            <Field
              label="Business email"
              name="businessEmail"
              type="email"
              required
            />
          </div>
          <Field label="Primary contact name" name="contactName" required />
          <label className="field">
            <span>Offer details</span>
            <textarea
              name="proposedDeal"
              required
              minLength={5}
              placeholder="e.g. 15% off for verified educators"
            />
          </label>
          <div className="locations-heading">
            <strong>Participating locations</strong>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setLocations((current) => [
                  ...current,
                  {
                    name: `Location ${current.length + 1}`,
                    address: "",
                    timezone: "",
                    radiusMeters: "150",
                  },
                ])
              }
            >
              + Add location
            </button>
          </div>
          {locations.map((location, index) => (
            <fieldset
              className="location-fieldset"
              key={`${index}-${location.name}`}
            >
              <legend>{location.name || `Location ${index + 1}`}</legend>
              <div className="two">
                <label className="field">
                  <span>Location name</span>
                  <input
                    value={location.name}
                    onChange={(event) =>
                      updateLocation(index, "name", event.target.value)
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>Full street address</span>
                  <input
                    value={location.address}
                    onChange={(event) =>
                      updateLocation(index, "address", event.target.value)
                    }
                    required
                  />
                </label>
              </div>
              <div className="two">
                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={location.timezone}
                    onChange={(event) =>
                      updateLocation(index, "timezone", event.target.value)
                    }
                    placeholder="America/Chicago"
                    required
                  />
                </label>
                <label className="field">
                  <span>Allowed radius (meters)</span>
                  <input
                    type="number"
                    min="25"
                    max="1000"
                    value={location.radiusMeters}
                    onChange={(event) =>
                      updateLocation(index, "radiusMeters", event.target.value)
                    }
                    required
                  />
                </label>
              </div>
              {locations.length > 1 && (
                <button
                  type="button"
                  className="remove-location"
                  onClick={() =>
                    setLocations((current) =>
                      current.filter(
                        (_, locationIndex) => locationIndex !== index,
                      ),
                    )
                  }
                >
                  Remove location
                </button>
              )}
            </fieldset>
          ))}
          <div className="two">
            <label className="field">
              <span>POS system</span>
              <input
                name="posSystem"
                required
                placeholder="Square, Toast, Clover…"
              />
            </label>
            <label className="field">
              <span>Redemption method</span>
              <select name="redemptionMethod" required defaultValue="">
                <option value="" disabled>
                  Select a method
                </option>
                <option value="pos_button">POS button</option>
                <option value="coupon_code">Coupon code</option>
                <option value="barcode">Barcode</option>
                <option value="cashier_instruction">Cashier instruction</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Code, barcode value, or cashier instruction</span>
            <textarea
              name="redemptionValue"
              placeholder="Shared securely with approved locations"
            />
          </label>
          <div className="two">
            <label className="field">
              <span>Display lifetime (minutes)</span>
              <input
                name="displayLifetimeMinutes"
                type="number"
                min="1"
                max="60"
                defaultValue="5"
                required
              />
            </label>
            <label className="field">
              <span>Maximum uses (limited offers only)</span>
              <input
                name="usageLimit"
                type="number"
                min="1"
                placeholder="1"
              />
            </label>
          </div>
          <label className="field">
            <span>Usage limit window</span>
            <select name="usageLimitWindow" required defaultValue="every_visit">
              <option value="every_visit">Every visit</option>
              <option value="day">Once daily</option>
              <option value="month">Once monthly</option>
              <option value="lifetime">One time only</option>
            </select>
          </label>
          <label className="field">
            <span>Tracking setup</span>
            <select
              name="trackingMode"
              required
              defaultValue="standard_geolocation"
            >
              <option value="standard_geolocation">
                Standard geolocation tracking
              </option>
              <option value="enhanced_pos">
                Enhanced POS tracking (follow-up required)
              </option>
            </select>
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>
            {busy ? "Sending application…" : "Submit Business Application"}
          </Button>
        </form>
      )}
    </Page>
  )
}

function DealSkeletons({ count = 4 }: { count?: number }) {
  return (
    <section className="deal-grid" aria-label="Loading deals">
      {Array.from({ length: count }, (_, index) => (
        <div className="deal-card skeleton-card" key={index}>
          <div className="skeleton skeleton-image" />
          <div className="skeleton-copy">
            <span className="skeleton short" />
            <span className="skeleton title" />
            <span className="skeleton medium" />
            <span className="skeleton line" />
          </div>
        </div>
      ))}
    </section>
  )
}
function DetailSkeleton() {
  return (
    <div className="detail-skeleton" aria-label="Loading deal">
      <div className="skeleton detail-image" />
      <div className="skeleton-copy">
        <span className="skeleton short" />
        <span className="skeleton title" />
        <span className="skeleton line" />
        <span className="skeleton line" />
        <span className="skeleton button" />
      </div>
    </div>
  )
}
function Empty({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <section className="empty">
      <div className="empty-emblem">
        <ShieldCheck size={34} weight="duotone" />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </section>
  )
}

type AdminBusiness = {
  id: string
  name: string
  category: string
  description: string
  image_url: string
  website_url: string | null
  address: string | null
  published: boolean
  locations?: DealLocation[]
}
type AdminDeal = {
  id: string
  business_id: string
  business_name: string
  title: string
  description: string
  channel: "in_person" | "online"
  category: string
  restrictions: string
  estimated_savings_cents: number
  featured: boolean
  sponsored: boolean
  giveaway: boolean
  image_url: string | null
  published: boolean
}
type VerificationCase = {
  id: string
  email: string
  role: string
  domain: string
  status: string
  classification?: string
  reason?: string
  source?: string
  created_at?: string
}
type ActivationMetric = {
  business_name: string
  location_name?: string
  activations: number
  unique_educators: number
  repeat_usage: number
}
type BusinessApplication = {
  id: string
  business_name: string
  contact_name: string
  business_email: string
  proposed_deal: string
  pos_system: string
  redemption_method: string
  display_ttl_seconds: number
  usage_limit_count: number
  usage_limit_period: string
  tracking_mode: string
  status: string
  locations: Array<DealLocation & { radiusMeters: number, timezone: string }>
}
type DomainReview = {
  id: string
  normalized_domain: string
  classification: "staff_only" | "shared_staff_student" | "personal_provider" | "unknown"
  decision: "auto_eligible" | "manual_review" | "blocked"
  eligible_role: "K-12 educator" | "College professor" | "both" | null
  evidence: string | null
  evidence_url: string | null
  reviewed_at: string | null
  institution_name: string | null
  source_code: string | null
}

function resizeDealImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("The image could not be read."))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () =>
        reject(new Error("Please choose a valid image file."))
      image.onload = () => {
        const width = 1200,
          height = 800,
          scale = Math.max(width / image.width, height / image.height),
          canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
        if (!context)
          return reject(new Error("Image processing is unavailable."))
        context.fillStyle = "#eef2f7"
        context.fillRect(0, 0, width, height)
        const drawWidth = image.width * scale,
          drawHeight = image.height * scale
        context.drawImage(
          image,
          (width - drawWidth) / 2,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        )
        resolve(canvas.toDataURL("image/jpeg", 0.84))
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function AdminDealPreview({
  deal,
  image,
}: {
  deal: Pick<AdminDeal, "business_name" | "title" | "description" | "channel" | "category" | "giveaway">
  image?: string | null
}) {
  return (
    <article className="admin-preview">
      <div className="admin-preview-image">
        <img
          src={
            deal.giveaway ? "/giveaway.jpeg" : image || "/teachersvip-logo.png"
          }
          alt=""
        />
        <span>
          {deal.giveaway
            ? "Win"
            : deal.channel === "online"
              ? "Online"
              : "In Person"}
        </span>
      </div>
      <div className="admin-preview-copy">
        <small>{deal.giveaway ? "Win" : deal.category}</small>
        <h3>{deal.business_name || "Business name"}</h3>
        <strong>
          {deal.giveaway
            ? "Enter to Win a Classroom Toolkit"
            : deal.title || "Deal title"}
        </strong>
        <p>{deal.description || "Your deal description will appear here."}</p>
      </div>
    </article>
  )
}

function BusinessApplicationReview({
  application,
  onChanged,
}: {
  application: BusinessApplication
  onChanged: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const slug =
    application.business_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "business"
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null
    const action = submitter?.value as "under_review" | "reject" | "approve"
    const notes = String(data.get("notes") || "")
    setBusy(true)
    setError("")
    try {
      const body: Record<string, unknown> = { action, notes }
      if (action === "approve") {
        const dateValue = (name: string) => {
          const value = String(data.get(name) || "")
          return value ? new Date(value).toISOString() : null
        }
        Object.assign(body, {
          businessId: data.get("businessId"),
          category: data.get("category"),
          description: data.get("description"),
          imageUrl: data.get("imageUrl"),
          websiteUrl: data.get("websiteUrl") || null,
          dealId: data.get("dealId"),
          dealTitle: data.get("dealTitle"),
          dealCategory: data.get("dealCategory"),
          restrictions: data.get("restrictions"),
          estimatedSavingsCents: Math.round(
            Number(data.get("estimatedSavings") || 0) * 100,
          ),
          startsAt: dateValue("startsAt"),
          endsAt: dateValue("endsAt"),
          publish: data.get("publish") === "on",
          locations: application.locations.map((location) => ({
            applicationLocationId: location.id,
            latitude: Number(data.get(`latitude-${location.id}`)),
            longitude: Number(data.get(`longitude-${location.id}`)),
            radiusMeters: Number(data.get(`radius-${location.id}`)),
          })),
        })
      }
      await patch(`/admin/business-applications/${application.id}`, body)
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="business-application-review">
      <button
        className="application-summary"
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>
          <strong>{application.business_name}</strong>
          <small>
            {application.contact_name} · {application.business_email}
          </small>
        </span>
        <span>
          {application.locations.length} location
          {application.locations.length === 1 ? "" : "s"} · {application.status}
        </span>
      </button>
      {expanded && (
        <form className="form-grid application-review-form" onSubmit={submit}>
          <Notice>
            {application.proposed_deal} · {application.pos_system} ·{" "}
            {application.redemption_method.replace(/_/g, " ")} · limit{" "}
            {application.usage_limit_count}/
            {application.usage_limit_period.replace(/_/g, " ")} ·{" "}
            {application.tracking_mode.replace(/_/g, " ")}
          </Notice>
          <label className="field">
            <span>Review notes</span>
            <textarea
              name="notes"
              required
              minLength={2}
              placeholder="Evidence checked and decision reason"
            />
          </label>
          {application.status !== "approved" &&
            application.status !== "rejected" && (
              <>
                <div className="two">
                  <Field
                    label="Business ID"
                    name="businessId"
                    defaultValue={slug}
                    required
                  />
                  <Field
                    label="Business category"
                    name="category"
                    defaultValue="Local business"
                    required
                  />
                </div>
                <label className="field">
                  <span>Business description</span>
                  <textarea
                    name="description"
                    required
                    minLength={5}
                    defaultValue={`${application.business_name} supports verified educators.`}
                  />
                </label>
                <div className="two">
                  <Field
                    label="Image URL"
                    name="imageUrl"
                    defaultValue="/teachersvip-logo.png"
                    required
                  />
                  <Field
                    label="Website URL (optional)"
                    name="websiteUrl"
                    type="url"
                  />
                </div>
                <div className="two">
                  <Field
                    label="Deal ID"
                    name="dealId"
                    defaultValue={`${slug}-educator-offer`}
                    required
                  />
                  <Field
                    label="Offer title"
                    name="dealTitle"
                    defaultValue={application.proposed_deal.slice(0, 150)}
                    required
                  />
                </div>
                <div className="two">
                  <Field
                    label="Deal category"
                    name="dealCategory"
                    defaultValue="Services"
                    required
                  />
                  <Field
                    label="Estimated savings ($)"
                    name="estimatedSavings"
                    type="number"
                    defaultValue="0"
                  />
                </div>
                <label className="field">
                  <span>Restrictions</span>
                  <textarea
                    name="restrictions"
                    required
                    minLength={2}
                    defaultValue="Valid for verified educators. Subject to the configured usage limit."
                  />
                </label>
                {application.locations.map((location) => (
                  <fieldset className="location-fieldset" key={location.id}>
                    <legend>{location.name || location.address}</legend>
                    <p className="field-note">
                      {location.address} · {location.timezone}
                    </p>
                    <div className="three">
                      <Field
                        label="Latitude"
                        name={`latitude-${location.id}`}
                        type="number"
                        min={-90}
                        max={90}
                        step="any"
                        required
                      />
                      <Field
                        label="Longitude"
                        name={`longitude-${location.id}`}
                        type="number"
                        min={-180}
                        max={180}
                        step="any"
                        required
                      />
                      <Field
                        label="Radius (meters)"
                        name={`radius-${location.id}`}
                        type="number"
                        min={25}
                        max={5000}
                        defaultValue={String(location.radiusMeters || 150)}
                        required
                      />
                    </div>
                  </fieldset>
                ))}
                <div className="two">
                  <Field
                    label="Starts (optional)"
                    name="startsAt"
                    type="datetime-local"
                  />
                  <Field
                    label="Ends (optional)"
                    name="endsAt"
                    type="datetime-local"
                  />
                </div>
                <label className="check">
                  <input name="publish" type="checkbox" />
                  <span>
                    Publish business and deal immediately after approval
                  </span>
                </label>
                <div className="admin-review-actions">
                  <button
                    className="action action-gold"
                    name="action"
                    value="approve"
                    disabled={busy}
                  >
                    Approve and create
                  </button>
                  <button
                    className="action action-soft"
                    name="action"
                    value="under_review"
                    disabled={busy}
                  >
                    Mark under review
                  </button>
                  <button
                    className="action action-danger"
                    name="action"
                    value="reject"
                    disabled={busy}
                  >
                    Reject
                  </button>
                </div>
              </>
            )}
          {error && <Notice kind="error">{error}</Notice>}
        </form>
      )}
    </article>
  )
}

function AdminPage() {
  const [businesses, setBusinesses] = useState<AdminBusiness[]>([]),
    [deals, setDeals] = useState<AdminDeal[]>([]),
    [inquiries, setInquiries] = useState<BusinessApplication[]>([]),
    [audit, setAudit] = useState<{
      id: string
      action: string
      entity_type: string
      entity_id: string
      created_at: string
      first_name: string
      last_name: string
    }[]>([]),
    [verificationQueue, setVerificationQueue] = useState<VerificationCase[]>(
      [],
    ),
    [activationMetrics, setActivationMetrics] = useState<ActivationMetric[]>(
      [],
    ),
    [metrics, setMetrics] = useState({
      members: 0,
      uses: 0,
      verifiedOnSiteActivations: 0,
      uniqueEducators: 0,
      repeatUsage: 0,
    }),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [dealImage, setDealImage] = useState<string | null>(null),
    [preview, setPreview] = useState<AdminDeal | null>(null)
  const load = async () => {
    const result = await api<{
      businesses: AdminBusiness[]
      deals: AdminDeal[]
      inquiries: typeof inquiries
      audit: typeof audit
      metrics?: Partial<typeof metrics>
      verificationQueue?: VerificationCase[]
      activationMetrics?: ActivationMetric[]
    }>("/admin/overview")
    setBusinesses(result.businesses)
    setDeals(result.deals)
    setInquiries(result.inquiries)
    setAudit(result.audit)
    setMetrics((current) => ({ ...current, ...result.metrics }))
    setVerificationQueue(result.verificationQueue || [])
    setActivationMetrics(result.activationMetrics || [])
  }
  useEffect(() => {
    void load().catch((e) => setError((e as Error).message))
  }, [])
  const submitBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMessage("")
    const d = new FormData(event.currentTarget)
    try {
      await post("/admin/businesses", {
        id: d.get("id"),
        name: d.get("name"),
        category: d.get("category"),
        description: d.get("description"),
        imageUrl: d.get("imageUrl"),
        websiteUrl: d.get("websiteUrl") || null,
        distance: d.get("distance") || null,
        hours: d.get("hours") || null,
        isOpen:
          d.get("isOpen") === "true"
            ? true
            : d.get("isOpen") === "false"
              ? false
              : null,
        address: d.get("address") || null,
        locationName: d.get("locationName") || "Primary location",
        timezone: d.get("timezone") || "UTC",
        radiusMeters: Number(d.get("radiusMeters") || 150),
        latitude: d.get("latitude") ? Number(d.get("latitude")) : null,
        longitude: d.get("longitude") ? Number(d.get("longitude")) : null,
      })
      event.currentTarget.reset()
      setMessage("Business added.")
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const submitDeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMessage("")
    const d = new FormData(event.currentTarget)
    const dateValue = (name: string) => {
      const value = String(d.get(name) || "")
      return value ? new Date(value).toISOString() : null
    }
    try {
      await post("/admin/deals", {
        id: d.get("id"),
        businessId: d.get("businessId"),
        title: d.get("title"),
        description: d.get("description"),
        channel: d.get("channel"),
        category: d.get("category"),
        restrictions: d.get("restrictions"),
        imageUrl: dealImage,
        promoCode: d.get("promoCode") || undefined,
        redemptionMethod: d.get("redemptionMethod"),
        redemptionValue: d.get("redemptionValue") || null,
        displayTtlSeconds: Number(d.get("displayLifetimeMinutes") || 5) * 60,
        usageLimitCount: d.get("usageLimitPeriod") !== "none" && d.get("usageLimitCount")
          ? Number(d.get("usageLimitCount"))
          : null,
        usageLimitPeriod: d.get("usageLimitPeriod"),
        usageLimitScope: d.get("usageLimitScope"),
        trackingMode: d.get("trackingMode"),
        locationIds: d.getAll("locationIds"),
        estimatedSavingsCents: Math.round(
          Number(d.get("estimatedSavingsCents") || 0) * 100,
        ),
        startsAt: dateValue("startsAt"),
        endsAt: dateValue("endsAt"),
        featured: d.get("featured") === "on",
        sponsored: d.get("sponsored") === "on",
        giveaway: d.get("giveaway") === "on",
      })
      event.currentTarget.reset()
      setDealImage(null)
      setMessage("Deal published to Discover.")
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const uploadDealImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, WEBP, or GIF image.")
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Images must be smaller than 8 MB.")
      return
    }
    try {
      setDealImage(await resizeDealImage(file))
      setError("")
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const togglePublished = async (deal: AdminDeal) => {
    try {
      await patch(`/admin/deals/${deal.id}`, { published: !deal.published })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const toggleBusiness = async (business: AdminBusiness) => {
    try {
      await patch(`/admin/businesses/${business.id}`, {
        published: !business.published,
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Page title="Superadmin Dashboard">
      <div className="admin-intro">
        <div>
          <span>CONTENT CONTROL</span>
          <h2>Load and publish educator deals</h2>
          <p>
            Add businesses, attach offers, and control what verified educators
            see in Discover.
          </p>
        </div>
        <Storefront size={42} weight="duotone" />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {message && <Notice kind="success">{message}</Notice>}
      <section className="stats">
        <div>
          <strong>{businesses.length}</strong>
          <span>BUSINESSES</span>
        </div>
        <div>
          <strong>{deals.filter((d) => d.published).length}</strong>
          <span>PUBLISHED DEALS</span>
        </div>
        <div>
          <strong>{metrics.members}</strong>
          <span>MEMBERS</span>
        </div>
        <div>
          <strong>{metrics.uses}</strong>
          <span>VERIFIED ON-SITE DEAL ACTIVATIONS</span>
        </div>
      </section>
      <section className="admin-forms">
        <form className="admin-card form-grid" onSubmit={submitBusiness}>
          <div className="admin-card-heading">
            <Storefront size={22} />
            <div>
              <h2>Add business</h2>
              <p>Create the business record first.</p>
            </div>
          </div>
          <Field
            label="URL slug"
            name="id"
            placeholder="bright-cafe"
            required
          />
          <Field label="Business name" name="name" required />
          <Field
            label="Category"
            name="category"
            placeholder="Dining"
            required
          />
          <label className="field">
            <span>Description</span>
            <textarea name="description" required minLength={5} />
          </label>
          <Field
            label="Image URL"
            name="imageUrl"
            placeholder="/business.jpg"
            required
          />
          <Field label="Website URL" name="websiteUrl" type="url" />
          <div className="two">
            <Field label="Address" name="address" />
            <Field
              label="Distance label"
              name="distance"
              placeholder="Houston, TX"
            />
          </div>
          <div className="two">
            <Field
              label="Location name"
              name="locationName"
              defaultValue="Primary location"
              required
            />
            <Field
              label="Timezone"
              name="timezone"
              defaultValue="America/Chicago"
              required
            />
          </div>
          <div className="three">
            <Field
              label="Latitude"
              name="latitude"
              type="number"
              min={-90}
              max={90}
              step="any"
              required
            />
            <Field
              label="Longitude"
              name="longitude"
              type="number"
              min={-180}
              max={180}
              step="any"
              required
            />
            <Field
              label="Radius (meters)"
              name="radiusMeters"
              type="number"
              min={25}
              max={5000}
              defaultValue="150"
              required
            />
          </div>
          <div className="two">
            <Field label="Hours" name="hours" placeholder="Open until 9 PM" />
            <label className="field">
              <span>Open status</span>
              <select name="isOpen" defaultValue="">
                <option value="">Unknown</option>
                <option value="true">Open</option>
                <option value="false">Closed</option>
              </select>
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            Add Business
          </Button>
        </form>
        <form className="admin-card form-grid" onSubmit={submitDeal}>
          <div className="admin-card-heading">
            <Tag size={22} />
            <div>
              <h2>Load a deal</h2>
              <p>New deals publish immediately after saving.</p>
            </div>
          </div>
          <Field
            label="Deal ID"
            name="id"
            placeholder="bright-cafe-15"
            required
          />
          <label className="field">
            <span>Business</span>
            <select name="businessId" required defaultValue="">
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
          <label className="field">
            <span>Participating locations (in-person)</span>
            <select
              name="locationIds"
              multiple
              size={Math.min(
                6,
                Math.max(
                  2,
                  businesses.flatMap((business) => business.locations || [])
                    .length,
                ),
              )}
            >
              {businesses.flatMap((business) =>
                (business.locations || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {business.name} · {location.name || location.address}
                  </option>
                )),
              )}
            </select>
            <small className="field-note">
              Select the locations for this offer. If none are selected, all
              active locations for the chosen business are used.
            </small>
          </label>
          <Field
            label="Offer title"
            name="title"
            placeholder="15% off your order"
            required
          />
          <label className="field">
            <span>Deal description</span>
            <textarea name="description" required minLength={5} />
          </label>
          <div className="two">
            <label className="field">
              <span>Channel</span>
              <select name="channel" defaultValue="in_person">
                <option value="in_person">In person</option>
                <option value="online">Online</option>
              </select>
            </label>
            <Field
              label="Category"
              name="category"
              placeholder="Dining"
              required
            />
          </div>
          <label className="field">
            <span>Restrictions</span>
            <textarea
              name="restrictions"
              required
              minLength={2}
              placeholder="Valid for verified educators. One per visit."
            />
          </label>
          <div className="two">
            <label className="field">
              <span>Redemption method</span>
              <select
                name="redemptionMethod"
                required
                defaultValue="cashier_instruction"
              >
                <option value="pos_button">POS button</option>
                <option value="coupon_code">Coupon code</option>
                <option value="barcode">Barcode</option>
                <option value="cashier_instruction">Cashier instruction</option>
              </select>
            </label>
            <label className="field">
              <span>Tracking setup</span>
              <select
                name="trackingMode"
                required
                defaultValue="standard_geolocation"
              >
                <option value="standard_geolocation">
                  Standard geolocation
                </option>
                <option value="enhanced_pos">Enhanced POS tracking</option>
                <option value="online">Online (no location)</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Code, barcode value, or cashier instruction</span>
            <textarea
              name="redemptionValue"
              placeholder="Displayed only after a successful activation"
            />
          </label>
          <div className="three">
            <Field
              label="Display lifetime (minutes)"
              name="displayLifetimeMinutes"
              type="number"
              min={1}
              max={60}
              defaultValue="5"
              required
            />
            <Field
              label="Usage limit"
              name="usageLimitCount"
              type="number"
              min={1}
              max={1000}
              defaultValue="1"
              required
            />
            <label className="field">
              <span>Usage window</span>
              <select name="usageLimitPeriod" required defaultValue="day">
                <option value="none">Every visit</option>
                <option value="day">Once daily</option>
                <option value="month">Once monthly</option>
                <option value="lifetime">One time only</option>
                <option value="promo">Promotional period</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Limit scope</span>
            <select name="usageLimitScope" defaultValue="offer">
              <option value="offer">Across the offer</option>
              <option value="location">Per location</option>
            </select>
          </label>
          <div className="two">
            <Field
              label="Estimated savings ($)"
              name="estimatedSavingsCents"
              type="number"
              minLength={1}
              placeholder="5"
            />
            <Field label="Promo code (online only)" name="promoCode" />
          </div>
          <div className="two">
            <Field
              label="Starts (optional)"
              name="startsAt"
              type="datetime-local"
            />
            <Field
              label="Ends (optional)"
              name="endsAt"
              type="datetime-local"
            />
          </div>
          <label className="field upload-field">
            <span>Deal image</span>
            <input
              name="dealImage"
              type="file"
              accept="image/*"
              onChange={(event) => void uploadDealImage(event)}
            />
            <small>
              Images are normalized to the same 3:2 deal-card frame.
            </small>
            {dealImage && (
              <img
                className="upload-thumb"
                src={dealImage}
                alt="Deal image preview"
              />
            )}
          </label>
          <label className="check">
            <input name="featured" type="checkbox" />
            <span>Featured deal</span>
          </label>
          <label className="check">
            <input name="sponsored" type="checkbox" />
            <span>Sponsored placement</span>
          </label>
          <label className="check">
            <input name="giveaway" type="checkbox" />
            <span>Giveaway</span>
          </label>
          <Button type="submit" disabled={busy || !businesses.length}>
            Publish Deal
          </Button>
        </form>
      </section>
      <section className="admin-card admin-table-card">
        <div className="admin-card-heading">
          <Storefront size={22} />
          <div>
            <h2>Business inventory</h2>
            <p>Hide a business to remove all of its deals from Discover.</p>
          </div>
        </div>
        <div className="admin-table">
          {businesses.map((business) => (
            <div className="admin-row" key={business.id}>
              <div>
                <strong>{business.name}</strong>
                <span>
                  {business.category} · {business.address || "Online business"}
                </span>
              </div>
              <span
                className={`admin-status ${business.published ? "live" : ""}`}
              >
                {business.published ? "Published" : "Hidden"}
              </span>
              <button
                className="action action-soft"
                onClick={() => void toggleBusiness(business)}
              >
                {business.published ? "Hide" : "Publish"}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="admin-card admin-table-card">
        <div className="admin-card-heading">
          <Tag size={22} />
          <div>
            <h2>Deal inventory</h2>
            <p>Publishing changes are reflected in Discover immediately.</p>
          </div>
        </div>
        <div className="admin-table">
          {deals.map((deal) => (
            <div className="admin-row" key={deal.id}>
              <div>
                <strong>{deal.title}</strong>
                <span>
                  {deal.business_name} · {deal.category}
                </span>
              </div>
              <span className={`admin-status ${deal.published ? "live" : ""}`}>
                {deal.published ? "Published" : "Hidden"}
              </span>
              <button
                className="action action-soft"
                onClick={() => setPreview(deal)}
              >
                Preview
              </button>
              <button
                className="action action-soft"
                onClick={() => void togglePublished(deal)}
              >
                {deal.published ? "Hide" : "Publish"}
              </button>
            </div>
          ))}
          {!deals.length && <p className="admin-empty">No deals loaded yet.</p>}
        </div>
      </section>
      {preview && (
        <section className="admin-card admin-preview-panel">
          <div className="admin-card-heading">
            <Tag size={22} />
            <div>
              <h2>Preview</h2>
              <p>This is how the deal will appear to educators.</p>
            </div>
            <button
              className="action action-soft"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>
          <AdminDealPreview deal={preview} image={preview.image_url} />
        </section>
      )}
      <section className="admin-card admin-table-card">
        <div className="admin-card-heading">
          <Storefront size={22} />
          <div>
            <h2>Partner requests</h2>
            <p>Business interest submitted through the public site.</p>
          </div>
        </div>
        <div className="admin-table">
          {inquiries.map((item) => (
            <BusinessApplicationReview
              key={item.id}
              application={item}
              onChanged={load}
            />
          ))}
          {!inquiries.length && (
            <p className="admin-empty">No partner requests yet.</p>
          )}
        </div>
      </section>
      <section className="admin-card admin-table-card">
        <div className="admin-card-heading">
          <ShieldCheck size={22} />
          <div>
            <h2>Recent admin activity</h2>
            <p>Publishing actions are retained for accountability.</p>
          </div>
        </div>
        <div className="admin-table">
          {audit.map((item) => (
            <div className="admin-row" key={item.id}>
              <div>
                <strong>
                  {item.action} {item.entity_type}
                </strong>
                <span>
                  {item.entity_id} · {item.first_name} {item.last_name}
                </span>
              </div>
              <span>{new Date(item.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </Page>
  )
}

function ActivationVipCardPage({ user }: { user: SessionUser }) {
  const [card, setCard] = useState<Card | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const loadCard = () =>
    api<{ card: Card }>("/me/vip-card")
      .then((result) => setCard(result.card))
      .catch((e) => setError(e.message))
  useEffect(() => {
    if (user.verified) void loadCard()
  }, [user.verified])
  const issueWalletPass = async () => {
    setBusy(true)
    setError("")
    try {
      const result = await post<{
        status: Card["walletStatus"]
        downloadUrl?: string | null
      }>("/me/wallet-pass")
      setCard((current) =>
        current
          ? {
              ...current,
              walletStatus: result.status,
              walletDownloadUrl:
                result.downloadUrl || current.walletDownloadUrl,
            }
          : current,
      )
    } catch (e) {
      setError((e as Error).message)
      await loadCard()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Page title="Your VIP Card" narrow>
      {!user.verified ? (
        <Empty
          title="Verification required"
          text="Confirm your email address before your personalized card is issued."
          action={
            <Link className="action action-gold" to="/verify">
              Verify Email Address
            </Link>
          }
        />
      ) : card ? (
        <>
          <section className="vip-card">
            <div className="card-brand">
              <Logo light />
              <span>VERIFIED EDUCATOR</span>
            </div>
            <div className="card-person">
              <small>MEMBER NAME</small>
              <strong>{card.teacherName}</strong>
              <small>MEMBER ID</small>
              <b>{card.member_id}</b>
            </div>
            <div className="card-footer">
              <span>Verified Educator</span>
              <span>Free for educators. Always.</span>
            </div>
          </section>
          <p className="card-help">
            Use Deal is the primary way to unlock participating offers. Your VIP
            Card remains available here as proof of educator status.
          </p>
          {card.walletDownloadUrl ? (
            <a
              className="action action-gold"
              href={card.walletDownloadUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Pass2U Card
            </a>
          ) : card.walletStatus === "not_configured" ? (
            <Notice>
              Pass2U card delivery will appear here once the provider is
              configured.
            </Notice>
          ) : (
            <Button
              disabled={busy || card.walletStatus === "pending"}
              onClick={() => void issueWalletPass()}
            >
              {busy || card.walletStatus === "pending"
                ? "Preparing Pass2U Card…"
                : card.walletStatus === "failed"
                  ? "Retry Pass2U Card"
                  : "Get Pass2U Card"}
            </Button>
          )}
        </>
      ) : (
        <p>Loading your personalized card…</p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Page>
  )
}

function ActivationProfilePage({
  onSignOut,
}: {
  onSignOut: () => Promise<void>
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [records, setRecords] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(false)
  const load = () =>
    Promise.all([
      api<{ profile: Profile }>("/me"),
      api<{ activations?: any[], reports?: any[] }>("/me/activations").catch(
        () => ({ activations: [], reports: [] }),
      ),
    ])
      .then(([profileResult, activityResult]) => {
        setProfile(profileResult.profile)
        setRecords(activityResult.activations || activityResult.reports || [])
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    void load()
  }, [])
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      await patch("/me", {
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        mobile: data.get("mobile") || null,
        city: data.get("city"),
        smsConsent: data.get("smsConsent") === "on",
        emailUpdates: data.get("emailUpdates") === "on",
      })
      await load()
      setEditing(false)
      setNotice("Personal information updated.")
    } catch (e) {
      setError((e as Error).message)
    }
  }
  if (!profile)
    return (
      <Page title="Teacher Profile">
        <p>Loading profile…</p>
        {error && <Notice kind="error">{error}</Notice>}
      </Page>
    )
  return (
    <Page title="Teacher Profile">
      <section className="profile-hero">
        <div className="avatar">
          {profile.first_name[0]}
          {profile.last_name[0]}
        </div>
        <div>
          <h2>
            {profile.first_name} {profile.last_name}
          </h2>
          <span
            className={`status ${
              profile.educator_verified_at ? "verified" : ""
            }`}
          >
            {profile.educator_verified_at
              ? "Verified Educator"
              : "Verification pending"}
          </span>
          <p>{profile.member_id}</p>
        </div>
      </section>
      <section className="stats">
        <div>
          <strong>{money(profile.estimated_savings_cents)}</strong>
          <span>Estimated savings</span>
        </div>
        <div>
          <strong>{records.length}</strong>
          <span>Deal activations</span>
        </div>
        <div>
          <strong>{profile.educator_verified_at ? "Active" : "Pending"}</strong>
          <span>Educator status</span>
        </div>
      </section>
      {notice && <Notice kind="success">{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <section className="communication-status" aria-label="Communication preferences">
        <div><span>Email updates</span><strong>{profile.email_updates ? "On" : "Off"}</strong></div>
        <div><span>Text updates</span><strong>{profile.sms_consent ? "On" : "Off"}</strong></div>
      </section>
      {editing ? (
        <form className="profile-form form-grid" onSubmit={save}>
          <div className="two">
            <Field
              label="First name"
              name="firstName"
              defaultValue={profile.first_name}
              required
            />
            <Field
              label="Last name"
              name="lastName"
              defaultValue={profile.last_name}
              required
            />
          </div>
          <Field
            label="Email address"
            name="email"
            defaultValue={profile.work_email || profile.personal_email}
            type="email"
            readOnly
          />
          <Field
            label="Mobile number (optional)"
            name="mobile"
            defaultValue={profile.mobile || ""}
          />
          <Field
            label="City"
            name="city"
            defaultValue={profile.city}
            required
          />
          <label className="check">
            <input
              name="emailUpdates"
              type="checkbox"
              defaultChecked={profile.email_updates}
            />
            <span>Email updates {profile.email_updates ? "On" : "Off"}</span>
          </label>
          <label className="check">
            <input
              name="smsConsent"
              type="checkbox"
              defaultChecked={profile.sms_consent}
            />
            <span>Text updates {profile.sms_consent ? "On" : "Off"}</span>
          </label>
          <Button type="submit">Save Changes</Button>
          <Button variant="soft" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="profile-actions">
          <Button variant="soft" onClick={() => setEditing(true)}>
            Edit Account Information
          </Button>
          <Link className="action action-soft" to="/vip-card">
            Show VIP Card
          </Link>
          <Link className="action action-soft" to="/support">
            Help &amp; Support
          </Link>
          <Link className="action action-soft" to="/partner">
            Partner With Us
          </Link>
          <Button
            variant="soft"
            onClick={async () => {
              setError("")
              try {
                await post("/me/unsubscribe")
                await load()
                setNotice("You have been unsubscribed from email and text updates.")
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            Unsubscribe
          </Button>
          <Button variant="danger" onClick={() => void onSignOut()}>
            Sign Out
          </Button>
        </div>
      )}
      <section className="history">
        <h2>Deal activation history</h2>
        {records.length ? (
          records.map((record) => (
            <div className="history-row" key={record.id}>
              <span>
                <b>
                  {record.business_name ||
                    record.businessName ||
                    "TeachersVIP offer"}
                </b>
                <small>
                  {new Date(
                    record.activated_at || record.created_at || Date.now(),
                  ).toLocaleDateString()}
                </small>
              </span>
              <strong>Verified activation</strong>
            </div>
          ))
        ) : (
          <p>
            No deal activations yet. Activate an offer on-site to see it here.
          </p>
        )}
      </section>
    </Page>
  )
}

function ActivationSupport() {
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(0)
  const faqs = [
    {
      question: "How do I activate an in-person offer?",
      answer:
        "Open a deal, choose the participating location, and tap Use Deal. TeachersVIP requests your location and unlocks the offer only when you are within the approved business radius.",
    },
    {
      question: "What does Location Verified mean?",
      answer:
        "It means TeachersVIP confirmed a current location signal near the selected business and recorded a Verified On-Site Deal Activation. It does not confirm a completed purchase.",
    },
    {
      question: "How do online offers work?",
      answer:
        "Online offers use the same controlled activation flow without requesting geolocation. The activation is recorded as online offer access.",
    },
    {
      question: "What email can I use for verification?",
      answer:
        "Use any valid email address. During the pilot, confirming ownership is enough; educator-only domain checks can be activated later, sending shared, personal, and unknown domains to manual review.",
    },
    {
      question: "Is the VIP Card still available?",
      answer:
        "Yes. Your VIP Card remains in navigation as proof of educator status, while Use Deal is the primary way to track offer activations.",
    },
  ]
  const shown = faqs.filter((item) =>
    `${item.question} ${item.answer}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  return (
    <Page title="Help & Support" narrow>
      <section className="support-intro">
        <div className="support-icon">
          <Question size={30} weight="duotone" />
        </div>
        <div>
          <h2>How can we help?</h2>
          <p>
            Answers for verification, educator status, and verified deal
            activations.
          </p>
        </div>
      </section>
      <label className="search-wrap support-search">
        <MagnifyingGlass size={20} />
        <input
          aria-label="Search help topics"
          placeholder="Search help topics"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <section className="faq-list">
        {shown.map((item, index) => {
          const expanded = open === index && !query
          return (
            <article
              className={`faq ${expanded ? "open" : ""}`}
              key={item.question}
            >
              <button
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? -1 : index)}
              >
                <span>{item.question}</span>
                <span aria-hidden="true">+</span>
              </button>
              {(expanded || query) && <p>{item.answer}</p>}
            </article>
          )
        })}
      </section>
      {!shown.length && (
        <Empty
          title="No matching help topic"
          text="Try a shorter search phrase."
        />
      )}
      <section className="support-partner">
        <div>
          <small>FOR BUSINESSES</small>
          <h3>Want to offer an educator perk?</h3>
          <p>
            Submit every location, your POS system, redemption method, usage
            limits, and tracking preference.
          </p>
        </div>
        <Link className="action action-gold" to="/partner">
          Partner With Us
        </Link>
      </section>
    </Page>
  )
}

function DomainReviewForm({
  domain,
  onChanged,
}: {
  domain: DomainReview
  onChanged: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    const data = new FormData(event.currentTarget)
    try {
      await patch(`/admin/domains/${domain.id}`, {
        classification: data.get("classification"),
        decision: data.get("decision"),
        eligibleRole: data.get("eligibleRole") || null,
        evidence: data.get("evidence") || null,
        evidenceUrl: data.get("evidenceUrl") || null,
      })
      await onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="domain-review-form form-grid" onSubmit={submit}>
      <div>
        <strong>{domain.normalized_domain}</strong>
        <small>
          {domain.institution_name || "Unlinked institution"}
          {domain.source_code ? ` · ${domain.source_code}` : ""}
          {domain.reviewed_at ? " · reviewed" : " · needs review"}
        </small>
      </div>
      <div className="three">
        <label className="field">
          <span>Classification</span>
          <select name="classification" defaultValue={domain.classification}>
            <option value="staff_only">Staff/faculty only</option>
            <option value="shared_staff_student">Shared staff/student</option>
            <option value="personal_provider">Personal email provider</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="field">
          <span>Decision</span>
          <select name="decision" defaultValue={domain.decision}>
            <option value="manual_review">Manual review</option>
            <option value="auto_eligible">Automatic eligibility</option>
            <option value="blocked">Blocked from automatic eligibility</option>
          </select>
        </label>
        <label className="field">
          <span>Eligible role</span>
          <select name="eligibleRole" defaultValue={domain.eligible_role || ""}>
            <option value="">Not set</option>
            <option value="K-12 educator">K-12 educator</option>
            <option value="College professor">College professor</option>
            <option value="both">Both educator roles</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Evidence</span>
        <textarea
          name="evidence"
          defaultValue={domain.evidence || ""}
          placeholder="Why this domain is staff-only or requires manual review"
        />
      </label>
      <Field
        label="Official evidence URL (optional)"
        name="evidenceUrl"
        type="url"
        defaultValue={domain.evidence_url || ""}
      />
      {error && <Notice kind="error">{error}</Notice>}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving domain…" : "Save Domain Decision"}
      </Button>
    </form>
  )
}

function AdminOperationsPage() {
  const [queue, setQueue] = useState<VerificationCase[]>([]),
    [metrics, setMetrics] = useState({
      verifiedOnSiteActivations: 0,
      uniqueEducators: 0,
      repeatUsage: 0,
    }),
    [activity, setActivity] = useState<ActivationMetric[]>([]),
    [domains, setDomains] = useState<DomainReview[]>([]),
    [reviewNotes, setReviewNotes] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [message, setMessage] = useState("")
  const load = async () => {
    try {
      const [result, domainResult] = await Promise.all([
        api<{
          verificationQueue?: VerificationCase[]
          metrics?: Partial<typeof metrics>
          activationMetrics?: ActivationMetric[]
        }>("/admin/overview"),
        api<{ domains: DomainReview[] }>("/admin/domains"),
      ])
      setQueue(result.verificationQueue || [])
      setMetrics((current) => ({ ...current, ...result.metrics }))
      setActivity(result.activationMetrics || [])
      setDomains(domainResult.domains)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const reviewVerification = async (
    item: VerificationCase,
    action: "approve" | "reject" | "request_information",
  ) => {
    const notes = (reviewNotes[item.id] || "").trim()
    if (notes.length < 2) {
      setError("Add review notes before deciding this verification case.")
      return
    }
    setError("")
    setMessage("")
    try {
      await patch(`/admin/verifications/${item.id}`, { action, notes })
      setMessage(
        `Verification case ${
          action === "approve"
            ? "approved"
            : action === "reject"
              ? "rejected"
              : "kept in review with an information request"
        }.`,
      )
      setReviewNotes((current) => ({ ...current, [item.id]: "" }))
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <Page title="Operations Dashboard">
        <div className="admin-intro">
          <div>
            <span>VERIFICATION &amp; ACTIVATION OPERATIONS</span>
            <h2>Evidence-led educator access</h2>
            <p>
              Review eligibility decisions and monitor successful
              location-verified activations without calling them purchases.
            </p>
          </div>
          <ShieldCheck size={42} weight="duotone" />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {message && <Notice kind="success">{message}</Notice>}
        <section className="stats">
          <div>
            <strong>{metrics.verifiedOnSiteActivations}</strong>
            <span>VERIFIED ON-SITE DEAL ACTIVATIONS</span>
          </div>
          <div>
            <strong>{metrics.uniqueEducators}</strong>
            <span>UNIQUE EDUCATORS</span>
          </div>
          <div>
            <strong>{metrics.repeatUsage}</strong>
            <span>REPEAT USAGE</span>
          </div>
        </section>
        <section className="admin-card admin-table-card">
          <div className="admin-card-heading">
            <ShieldCheck size={22} />
            <div>
              <h2>Educator-domain registry</h2>
              <p>
                Automatic approval is available only after a domain is reviewed
                as staff/faculty-only with evidence and an eligible role.
              </p>
            </div>
          </div>
          <div className="domain-review-list">
            {domains.map((domain) => (
              <DomainReviewForm
                key={domain.id}
                domain={domain}
                onChanged={load}
              />
            ))}
            {!domains.length && (
              <p className="admin-empty">
                Import an official NCES or Department of Education release to
                begin domain review.
              </p>
            )}
          </div>
        </section>
        <section className="admin-card admin-table-card">
          <div className="admin-card-heading">
            <ShieldCheck size={22} />
            <div>
              <h2>Educator verification queue</h2>
              <p>
                Shared university, unknown, and personal domains go to manual
                review.
              </p>
            </div>
          </div>
          <div className="admin-table">
            {queue.map((item) => (
              <div className="admin-row verification-review-row" key={item.id}>
                <div>
                  <strong>{item.email}</strong>
                  <span>
                    {item.role} · {item.domain}
                  </span>
                  <span>
                    {item.reason ||
                      item.classification ||
                      "Manual review required"}
                    {item.source ? ` · ${item.source}` : ""}
                  </span>
                </div>
                <span className="admin-status">{item.status}</span>
                <label className="field admin-review-notes">
                  <span>Review notes</span>
                  <textarea
                    value={reviewNotes[item.id] || ""}
                    onChange={(event) =>
                      setReviewNotes((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Record the evidence and reason for this decision"
                  />
                </label>
                <div className="admin-review-actions">
                  <button
                    className="action action-gold"
                    onClick={() => void reviewVerification(item, "approve")}
                  >
                    Approve educator
                  </button>
                  <button
                    className="action action-soft"
                    onClick={() =>
                      void reviewVerification(item, "request_information")
                    }
                  >
                    Request information
                  </button>
                  <button
                    className="action action-danger"
                    onClick={() => void reviewVerification(item, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!queue.length && (
              <p className="admin-empty">No pending verification cases.</p>
            )}
          </div>
        </section>
        <section className="admin-card admin-table-card">
          <div className="admin-card-heading">
            <MapPin size={22} />
            <div>
              <h2>Activity by business and location</h2>
              <p>
                Only successful in-person proximity checks feed these metrics.
              </p>
            </div>
          </div>
          <div className="admin-table">
            {activity.map((item) => (
              <div
                className="admin-row"
                key={`${item.business_name}-${item.location_name || "all"}`}
              >
                <div>
                  <strong>{item.business_name}</strong>
                  <span>{item.location_name || "All locations"}</span>
                </div>
                <span>
                  {item.activations} activations · {item.unique_educators}{" "}
                  unique · {item.repeat_usage} repeat
                </span>
              </div>
            ))}
            {!activity.length && (
              <p className="admin-empty">
                No verified on-site activations yet.
              </p>
            )}
          </div>
        </section>
      </Page>
      <AdminPage />
    </>
  )
}

function AppRoutes() {
  const [loading, setLoading] = useState(true),
    [user, setUser] = useState<SessionUser | null>(null),
    navigate = useNavigate(),
    routeLocation = useLocation()
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: SessionUser | null }>("/auth/session")
      setUser(r.user)
      return r.user
    } catch {
      setUser(null)
      return null
    }
  }, [])
  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])
  const signOut = async () => {
    await post("/auth/sign-out")
    setUser(null)
    navigate("/sign-in")
  }
  if (loading)
    return (
      <div className="splash">
        <Logo light />
        <span>Loading TeachersVIP…</span>
      </div>
    )
  if (user && !user.verified && routeLocation.pathname !== "/verify")
    return <Navigate to="/verify" replace />
  return user ? (
    <Shell user={user} onSignOut={signOut}>
      <Routes>
        <Route
          path="/verify"
          element={<Verify user={user} refresh={refresh} />}
        />
        <Route path="/deals" element={<Discover />} />
        <Route
          path="/deals/:id"
          element={<ActivationDealDetail user={user} />}
        />
        <Route path="/saved" element={<Saved />} />
        <Route
          path="/vip-card"
          element={<ActivationVipCardPage user={user} />}
        />
        <Route
          path="/profile"
          element={<ActivationProfilePage onSignOut={signOut} />}
        />
        <Route path="/support" element={<ActivationSupport />} />
        <Route path="/partner" element={<StructuredPartner />} />
        <Route
          path="/admin"
          element={
            user.is_superadmin ? (
              <AdminOperationsPage />
            ) : (
              <Navigate to="/deals" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/deals" replace />} />
      </Routes>
    </Shell>
  ) : (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/partner" element={<PublicPartner />} />
      <Route path="/verify" element={<PublicVerify />} />
      <Route path="/create-account" element={<Register refresh={refresh} />} />
      <Route
        path="/admin-register"
        element={<AdminRegister refresh={refresh} />}
      />
      <Route path="/sign-in" element={<SignIn refresh={refresh} />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
