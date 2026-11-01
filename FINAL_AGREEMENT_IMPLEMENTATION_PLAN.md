# TeachersVIP Final Agreement Implementation Plan

Status: approved on 2026-09-06; implementation in progress.

## Confirmed outcome

Keep the existing navy-and-gold visual system while replacing prototype verification and self-reported deal use with two production workflows:

1. Only eligible K-12 educators and college professors become verified. Email ownership is confirmed by link, but educator approval depends on a source-backed domain classification or manual review.
2. In-person offers use a server-validated, location-specific activation. TeachersVIP records a **Verified On-Site Deal Activation**, then briefly shows the configured POS instruction, coupon code, or barcode. This is not described as a completed purchase.

Business onboarding will collect every participating location and address, POS system, redemption method, offer usage limits, and standard-geolocation versus enhanced-POS tracking. Business submissions remain subject to superadmin review and do not publish themselves.

## Product wording and small onboarding revisions

- Make the city selector respond from the first typed character and keep all matching cities/towns/municipalities searchable rather than relying on a fixed shortlist or the current eight-result client-side Nominatim query. Use a server-side provider adapter and cache, with a provider that explicitly permits autocomplete. Include keyboard navigation, loading/empty/error states, accessible combobox semantics, and manual entry fallback.
- On Create Account, change the intro to end with an exclamation mark: “...businesses that support educators!”
- Change member password validation from 10 to 8 characters in both create-account and reset-password UI/API validation. Keep the one-time superadmin password at 12 characters unless separately requested; it is an administrative credential, not the member password rule.
- On the Forgot Password screen, make the “Free for educators. Always.” footer sit consistently at the bottom and remain centered on mobile and desktop. Apply the layout safely through the shared authentication frame so other short authentication screens do not jump.
- Change labels and help copy from “School email” to “Educator work email” where appropriate, and add role selection/attestation for `K-12 educator` or `College professor`.

## 1. Official institution and educator-domain registry

### Data model

Add a forward-only `009_educator_verification_and_deal_activations.sql` migration with normalized tables for:

- `education_data_imports`: source (`CCD`, `PSS`, `IPEDS`, `DAPIP`), release/version, official URL, checksum, imported timestamp, row totals, and status.
- `education_institutions`: stable federal/source ID, institution type, name, status, address, website, source, source release, and last-seen timestamp.
- `educator_domains`: normalized registrable domain/subdomain, institution ID, classification (`staff_only`, `shared_staff_student`, `personal_provider`, `unknown`), eligible role, decision (`auto_eligible`, `manual_review`, `blocked`), evidence, review timestamps, reviewer, and audit history.
- `educator_verification_cases`: user, work email, selected role, institution/domain match, status (`email_pending`, `manual_review`, `verified`, `rejected`, `suspended`), reason codes, review notes, timestamps, and reviewer.

Use a Public Suffix List-aware domain parser; do not classify addresses with hand-written “last two labels” logic.

### Official-source import

- Import public schools, districts, and charter indicators from NCES CCD.
- Import private K-12 schools from the latest available NCES PSS public-use release.
- Import higher-education directory/institution records from the latest IPEDS directory/Institutional Characteristics release.
- Use DAPIP to corroborate current postsecondary accreditation status.
- Normalize and upsert by stable source IDs. Retain source provenance and old snapshots so an import can be audited or rolled back without deleting verification history.
- Add an explicit import command and dry-run/report mode. Run imports deliberately in staging and production, not during every web deployment. Refresh when official releases change, with a periodic freshness review.

The official datasets establish institution identity and status; they do not by themselves prove that an email domain is restricted to teaching staff. Website domains discovered from a source record are candidates only. A domain becomes `auto_eligible` only after staff-only/faculty-only evidence is reviewed and recorded. Shared university/student domains, unmatched domains, and personal providers create manual-review cases and are never automatically denied merely for being unknown.

### Verification decision flow

1. Registration creates an unverified account and verification case, sends a 30-minute email-ownership link to the entered educator work email, and does not yet issue an active member/wallet card.
2. Opening the link consumes it once and classifies the domain server-side.
3. Approved staff-only K-12 domains may automatically verify a user who attested `K-12 educator`. Higher-education automatic approval is limited to domains/subdomains evidenced as faculty/teaching-staff-only and a `College professor` attestation; ordinary campus domains go to manual review.
4. Personal, shared, or unknown domains show “Manual review required,” not “denied.” The superadmin queue shows source matches, reason, evidence, and approve/reject/request-information controls with an audit log.
5. Only a final `verified` decision sets `educator_verified_at`, activates the in-app VIP card, and starts idempotent Pass2U issuance. Provider failure must not silently lose the request: store `pending/active/failed`, show the failure to the superadmin, and provide a safe retry.
6. Resend messages cover link sent, manual review received, approved, rejected/request-more-information, and Pass2U issuance status where useful. No credential or sensitive review evidence is exposed to the browser.

Historical users verified under unrestricted-domain logic must not be silently grandfathered. Produce an audit report and place unverifiable records into a controlled re-verification campaign before public launch; the superadmin decides any exceptions.

## 2. Structured business onboarding and location setup

Replace the current three-field partner-interest form with a structured application that supports:

- business/contact details and proposed offer;
- a repeatable list of every participating location, full address, timezone, map coordinates, and requested geofence radius;
- POS vendor/system and optional version;
- redemption method: `POS button`, `coupon code`, `barcode`, or `cashier instruction`;
- the configured instruction/code/barcode value, stored encrypted when sensitive;
- display lifetime, proposed offer dates, and limits such as count per day, month, or promotional period;
- limit scope (offer-wide or per location);
- tracking selection: `standard geolocation` or `enhanced POS requested`.

Create normalized application/location records. Superadmin review will validate/geocode addresses, correct coordinates/radii, approve or reject the application, and promote approved data into operational `businesses`, `business_locations`, `deals`, and `deal_locations` records. Existing single-location business coordinates will be migrated into the new location table without data loss.

For the initial release, `enhanced POS requested` records a sales lead/configuration requirement; it does not claim completed-purchase tracking until a POS connector or custom setup is implemented and validated. Standard geolocation remains the usable fallback for in-person offers.

## 3. Official location-verified activation route

### Deal configuration and storage

Extend deals with redemption method, encrypted reveal payload/cashier instruction, configurable display TTL (proposed default: five minutes), limit count/window/scope, tracking mode, and eligible locations. Add `deal_activations` and atomic usage-counter records containing user, business, business location, deal, activation type, server time, idempotency key, usage bucket, geolocation decision, distance, reported accuracy, payload expiry, and risk metadata.

Do not rewrite historical `deal_use_reports` as verified activity. Retain/archive them as legacy self-reports and exclude them from new verified on-site metrics.

### Server activation sequence

Add a protected, rate-limited `POST /api/deals/:id/activate` endpoint:

- Require a currently verified educator and active/published deal/business/location.
- For an in-person offer, accept selected location ID, browser coordinates, accuracy, browser location timestamp, and an idempotency key. Reject stale readings, impossible values, and locations whose accuracy cannot support a confident decision; give a retry message rather than a false “outside” result.
- Calculate distance on the server and compare it with the approved radius. Never trust a client-calculated “inside” flag.
- If outside, record a denied attempt without returning redemption content.
- If inside, enforce the offer limit atomically in PostgreSQL so simultaneous/repeated taps cannot exceed the allowed count. Daily/monthly buckets use the location timezone; promotional-period limits use the configured offer window.
- Create the activation and return `Location Verified`, the offer, location, redemption instruction/code/barcode, and server-authored `expiresAt`. Repeated requests with the same idempotency key return the same unexpired result and never double-count.
- After expiry, hide redemption content. A consumed limit is not silently reset; the UI explains when the educator may activate again.
- For online-only deals, use the same controlled reveal/activation service without requesting geolocation and classify the record as `online_offer_access`, not `verified_on_site`.

Geolocation is a strong proximity signal but browser coordinates can be spoofed. The release will add HTTPS-only permission handling, accuracy/staleness checks, rate limits, idempotency, repeated-location/device risk signals, and audit logging, but will not promise fraud-proof presence. Exact submitted coordinates should be encrypted and retained only for a documented short audit window (proposed: 30 days); long-term analytics retain location ID, distance, accuracy, outcome, and timestamps rather than a permanent movement trail.

### Educator deal page

For in-person deals, show participating-location selection when needed, then order the actions:

1. `Use Deal` — primary gold button.
2. `Get Directions` — secondary action for the selected location.

Remove `I Used This Deal` everywhere and remove the primary image-overlay `Show VIP Card`. On `Use Deal`, show permission/requesting/checking states and precise permission-denied, location-unavailable, low-accuracy, outside-radius, limit-reached, and expired messages.

After success, show:

- `Location Verified`;
- business, selected location, and offer;
- limited-time POS button instruction, code, barcode, or cashier instruction;
- visible expiration countdown based on server time;
- secondary `Show VIP Card`;
- an explicit note that the event is a verified on-site deal activation, not a confirmed purchase.

The VIP Card remains available in desktop/mobile navigation as educator-status proof. Update Profile, Discover badges, history, help content, and empty states from “reported/used” terminology to accurate activation terminology. Online offers retain `Reveal/Use Online Offer` and never ask for location.

## 4. Superadmin operations and dashboard

Expand the protected dashboard into four operational areas:

- Verification queue: domain/source match, eligible role, automatic/manual reason, review actions, Pass2U status/retry, and audit trail.
- Business onboarding: applications, every location, address/geocode/radius validation, POS system, redemption method, limits, tracking choice, and promotion to published operational records.
- Deal/location editor: assign offers to one/all locations; configure radius, TTL, redemption content, usage limits, date window, and tracking mode; preview the exact educator success panel.
- Activation analytics with the exact headline **Verified On-Site Deal Activations**. Show total successful on-site activations, unique educators, repeat usage, and activity grouped by business/location with date filters. Define repeat usage as successful activations after an educator’s first successful activation for the selected business/location and period. Keep denied attempts and online accesses in separate operational panels. Never label these metrics as sales, redemptions, transactions, or completed purchases.

All decisions and configuration changes remain superadmin-protected and are written to `admin_audit_log`. Redemption secrets are masked after save and never returned by list endpoints.

## 5. Likely implementation files

Existing files:

- `src/App.tsx` — authentication copy, role/work-email onboarding, verification states, business application, location selector, Use Deal flow, countdown, profile/history, dashboard.
- `src/index.css` — bottom-aligned auth footer and responsive activation/admin layouts while retaining navy/gold styling.
- `src/lib/api.ts` — typed request support where required.
- `server/app.ts` — registration/verification decisions, admin workflows, activation endpoint, dashboard queries, and replacement of legacy report-use behavior.
- `server/config.ts`, `.env.example`, `README.md`, `package.json`, and `railway.toml` — provider/import/privacy/deployment configuration and operational commands.
- `server/integrations/pass2u.ts` — verified-only idempotent issuance/retry behavior.
- `server/api.integration.test.ts` and existing security/integration tests.

New focused modules/files are expected for domain classification, official-source imports, geolocation/distance validation, usage-limit enforcement, barcode rendering support, migration `009_educator_verification_and_deal_activations.sql`, and their unit/integration tests. Large raw federal datasets will not be committed to Git.

## 6. Verification and acceptance gates

Before deployment:

- Typecheck, unit tests, production build to a clean output directory, migration lint/application on a disposable PostgreSQL database, and `git diff --check` pass.
- Import dry-runs and staging imports report source version/checksum, expected institution categories, stable-ID upserts, duplicate handling, and no automatic approval of merely discovered/shared/personal domains.
- Integration tests cover auto-eligible K-12, faculty-only higher education, shared university, unknown, personal provider, expired/duplicate links, manual approval/rejection, and Pass2U success/failure/retry.
- Activation tests cover permission denial, stale/low-accuracy readings, inside/outside/boundary distance, multiple business locations, online bypass, idempotency, concurrent taps, daily/monthly/promo limits in location timezones, expired payloads, and secret non-disclosure.
- Browser QA covers create account, forgot/reset password, manual review, deal activation/countdown, VIP Card navigation, business onboarding, admin setup, and analytics at mobile, tablet, and desktop widths. Test with mocked geolocation plus at least one real HTTPS mobile-device inside/outside trial.
- Accessibility checks cover keyboard city/location selection, focus order, permission/status announcements, countdown behavior, contrast, and reduced motion.
- Dashboard database assertions prove that only successful in-person proximity checks feed **Verified On-Site Deal Activations** and that historical reports/online accesses/denied attempts are excluded.

Deployment sequence after validation:

1. Back up production and perform a staging restore test.
2. Deploy to a separate Railway staging database, apply migration, import official source snapshots, and seed only reviewed domain decisions.
3. Configure and test Resend, Pass2U, geocoding/city search, encryption keys, admin credentials, HTTPS geolocation, retention cleanup, and monitoring without exposing secrets to Vite/browser variables.
4. Run the complete staging journey for auto approval, manual review, Pass2U issuance, business onboarding, on-site activation, online offer, limit enforcement, and dashboard reconciliation.
5. Take a production backup, deploy behind verification/activation feature flags, apply migration/import, run smoke tests, then enable the new workflows. Roll back flags—not data—if an external provider fails.

Production completion means live PostgreSQL, email delivery, Pass2U issuance, real-device geolocation, dashboard reconciliation, backup/restore, and Railway health checks have all been evidenced. A source build alone is not deployment proof.

## 7. Luna-agent execution after approval

After explicit approval, use Luna agents in parallel with non-overlapping ownership:

- Luna A: migration, official-source import pipeline, domain classifier, verification-case tests.
- Luna B: business onboarding/location schema, activation/limits/geolocation backend modules, database integration tests.
- Luna C: educator/admin frontend states, city-search adapter UI, countdown/barcode presentation, responsive/accessibility tests.
- Primary agent: shared-file integration (`server/app.ts`, `src/App.tsx` where needed), conflict resolution, security review, staging/production verification, scoped commit/deployment, and final evidence report.

Implementation began after explicit user approval on 2026-09-06.
