# TeachersVIP

TeachersVIP is a responsive educator-benefits application. The initial release verifies eligible educators, issues a Pass2U card after approval, and records location-verified offer activations without representing them as completed purchases.

## Official product rules

- Eligible roles are limited to K-12 educators and college professors.
- During the pilot, every applicant may use any valid email address and confirms ownership through a time-limited link.
- When educator-only verification is activated, automatic approval is intentionally narrow: the domain must be reviewed as staff/faculty-only, have documented evidence, and allow the applicant's selected role.
- When `EDUCATOR_ONLY_VERIFICATION=true` is activated, personal email providers, shared staff/student university domains, unknown domains, blocked domains, and role mismatches go to manual review. They are not automatically denied.
- A member card and Pass2U issuance are created only after email verification in the pilot, or educator approval when educator-only verification is activated. Failed Pass2U issuance is retained and can be retried without creating duplicate passes.

The educator-domain registry is built from downloaded releases from:

- [NCES Common Core of Data (CCD)](https://nces.ed.gov/ccd/files.asp) for public districts, schools, and charters.
- [NCES Private School Universe Survey (PSS)](https://nces.ed.gov/surveys/pss/pssdata.asp) for private schools.
- [NCES IPEDS](https://nces.ed.gov/ipeds/use-the-data) for colleges and universities.
- [Department of Education DAPIP](https://ope.ed.gov/dapip/) for accredited postsecondary institutions and programs.

Imported domains begin in manual review. An administrator must record staff-only evidence before enabling automatic approval. This avoids treating a public website domain as proof that its email accounts are faculty-only.

## Deal activation route

For an in-person offer, a verified educator selects a participating location and presses **Use Deal**. The browser asks for current location, and the server checks the observation timestamp, accuracy, selected location, approved radius, and usage limit. A successful activation records the educator, business, location, offer, date, time, distance, and accuracy, then returns the configured POS instruction, coupon code, or barcode for a limited time. **Get Directions** remains secondary, and the VIP Card remains available as proof of status.

Online offers use the same controlled activation and usage-limit service without requesting geolocation.

The dashboard labels successful in-person records **Verified On-Site Deal Activations** and reports unique educators, repeat usage, and activity by business/location. These records establish proximity and access to an offer; they do not establish a completed purchase. Exact completed-purchase reporting requires the optional enhanced POS integration.

The activation dashboard can be filtered by date, business, and location. Its repeat-usage count means each successful on-site activation after an educator’s first successful activation at the same business and location during the selected period. It separately reports online offer accesses and denied on-site attempts; those categories are never added to verified on-site activation totals.

Browser geolocation is a useful proximity control, not tamper-proof proof of presence. Exact submitted coordinates are encrypted and retained for a short audit window (30 days by default); the scheduled purge removes them while preserving the selected location, distance, accuracy, outcome, and aggregate reporting fields.

## Business onboarding

The application asks a business for:

- every participating location and full address;
- its POS system;
- redemption method: POS button, coupon code, barcode, or cashier instruction;
- the protected redemption value/instruction and display lifetime;
- offer usage count and daily, monthly, or promotional-period window;
- standard geolocation tracking or enhanced POS tracking.

An administrator reviews the application, supplies reviewed latitude/longitude for every location, confirms the geofence radius, configures the business and offer records, and chooses whether to publish them.

## Creator Network and business reviews

The Teacher Creator Network form is public: it does not require a TeachersVIP account. A public submission is held privately until the submitted educator email is confirmed through a single-use, 30-minute link. A signed-in verified member may submit with their already verified membership email without another confirmation. Only email-confirmed submissions appear in the private admin list, where city, platform, content niche, audience size, and workflow status can be filtered. Pending public submissions are throttled per email, and production fails closed rather than exposing a temporary confirmation URL when email delivery is not configured.

Verified educators may leave feedback after they successfully activate the specific offer shown on the deal page. Reviews start as pending, are moderated by an administrator, and only approved feedback appears publicly. Verified members can comment on and report approved reviews; comments require approval. Administrators can remove approved reviews. A review describes an educator’s experience after offer access; it is not a completed-purchase record or a POS confirmation.

## Launch feedback, alerts, and reporting

Members can suggest businesses and report expired, dishonored, or incorrect offers. Reports and suggestions are available in the protected superadmin panel alongside contact messages and review reports. The launch dashboard aggregates registrations, verified educators, sign-ups by city, deal views, current saves, on-site activations, online offer accesses, reviews, confirmed creator applications, and business inquiries.

When a member has no in-person deals in their city, Discover offers a city-deal alert using the account email. New published physical deals trigger matching-city emails. Configure `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and `MARKETING_POSTAL_ADDRESS` (the business's valid postal address) before enabling delivery. Without these, interest is saved but no marketing email is sent. Alert emails include a one-step unsubscribe link; members can also turn alerts off in Discover. Review the public Privacy Policy and Terms with counsel before treating them as final legal documents.

The homepage uses adapted React Bits SpotlightCard and StarBorder components from [reactbits.dev](https://reactbits.dev/), with reduced-motion handling and the existing navy-and-gold palette.

## Local development

Requirements: Node.js 24+, pnpm, and PostgreSQL 17+.

1. Copy `.env.example` to `.env` and replace all development secrets.
2. Create the PostgreSQL database referenced by `DATABASE_URL`.
3. Run `pnpm db:migrate`.
4. Run `pnpm db:seed`.
5. Run `pnpm dev:full`.
6. Open `http://localhost:8443`.

The Vite client runs on port 8443 and proxies API requests to Fastify on port 8787.

Configure the server-only `MAPBOX_PUBLIC_TOKEN` to enable global city and street-address suggestions from the first typed character. Autocomplete requests are temporary and are not cached. When a partner selects a Mapbox address, the server resolves it with permanent geocoding before storing the normalized address, coordinates, IANA timezone, and provider provenance. When Mapbox is not configured or unavailable, city fallback suggestions and manual address entry remain available.

## Importing official education data

Download a CSV release directly from one of the official sources, keep the raw file outside the repository, and dry-run the import first:

```text
pnpm education:import --source CCD --file C:\data\ccd.csv --release 2025 --dry-run
pnpm education:import --source CCD --file C:\data\ccd.csv --release 2025
```

Supported source values are `CCD`, `PSS`, `IPEDS`, and `DAPIP`. The importer records the official URL, release, SHA-256 checksum, row counts, normalized snapshots, and discovered institution website domains. Re-importing the same checksum is idempotent.

After import, use the superadmin domain registry to classify each candidate domain and record its official evidence. Only a reviewed `staff_only` + `auto_eligible` decision can participate in automatic educator verification.

## Email and Pass2U

Verification and password-reset email use Resend when configured. In local development, temporary links are shown in the application.

Pass2U requires:

- `PASS2U_API_KEY`
- `PASS2U_MODEL_ID`
- `PASS2U_MEMBER_NAME_FIELD`
- `PASS2U_MEMBER_ID_FIELD`
- `PASS2U_STATUS_FIELD`

The Pass2U API key and encryption key are server-only and must never use a `VITE_` prefix. Device-specific Apple/Google wording should remain withheld until the generated pass is validated on real devices.

## Retention and scheduled maintenance

The web process purges expired exact-coordinate evidence on startup and every six hours. `pnpm locations:purge` remains available for manual or scheduled maintenance. `ACTIVATION_LOCATION_RETENTION_DAYS` controls the exact-coordinate audit window. Changing it does not retroactively restore already-purged coordinates.

## Railway

Use separate staging and production environments and databases. Configure every required value in `.env.example`, enable PostgreSQL backups, test a restore, run the official data imports, review educator domains, and validate Pass2U on devices before launch. `railway.toml` applies migrations and seed upserts once in the pre-deploy phase, starts Fastify as the web process, and checks `/health/ready`.

Before production launch, apply every pending migration, configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, and verify the Creator Network confirmation email on a real mailbox. Test one on-site activation over HTTPS with a physical device at an approved location, one outside-radius denial, an online offer access, review moderation, and filtered dashboard totals. Browser geolocation and the local test build cannot prove the device, HTTPS permission, mail-delivery, or production-database portions of that checklist.

## Commands

- `pnpm dev:full` — run the client and API locally.
- `pnpm typecheck` — verify the React TypeScript build.
- `pnpm test` — run unit tests; database integration tests run when `TEST_DATABASE_URL` is set.
- `pnpm build` — create the production client bundle.
- `pnpm db:migrate` — apply versioned PostgreSQL migrations.
- `pnpm db:seed` — idempotently seed the initial deal catalogue.
- `pnpm education:import -- ...` — import an official education release.
- `pnpm locations:purge` — purge expired exact activation coordinates.
