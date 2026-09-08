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

## Local development

Requirements: Node.js 24+, pnpm, and PostgreSQL 17+.

1. Copy `.env.example` to `.env` and replace all development secrets.
2. Create the PostgreSQL database referenced by `DATABASE_URL`.
3. Run `pnpm db:migrate`.
4. Run `pnpm db:seed`.
5. Run `pnpm dev:full`.
6. Open `http://localhost:8443`.

The Vite client runs on port 8443 and proxies API requests to Fastify on port 8787.

Configure `MAPBOX_ACCESS_TOKEN` to enable global city suggestions from the first typed character. Manual city entry remains available when the provider is unavailable.

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

Run `pnpm locations:purge` at least daily from a Railway cron service or equivalent scheduler. `ACTIVATION_LOCATION_RETENTION_DAYS` controls the exact-coordinate audit window. Changing it does not retroactively restore already-purged coordinates.

## Railway

Use separate staging and production environments and databases. Configure every required value in `.env.example`, enable PostgreSQL backups, test a restore, run the official data imports, review educator domains, and validate Pass2U on devices before launch. `railway.toml` builds the client, applies migrations and seed upserts, starts Fastify, and checks `/health/ready`.

## Commands

- `pnpm dev:full` — run the client and API locally.
- `pnpm typecheck` — verify the React TypeScript build.
- `pnpm test` — run unit tests; database integration tests run when `TEST_DATABASE_URL` is set.
- `pnpm build` — create the production client bundle.
- `pnpm db:migrate` — apply versioned PostgreSQL migrations.
- `pnpm db:seed` — idempotently seed the initial deal catalogue.
- `pnpm education:import -- ...` — import an official education release.
- `pnpm locations:purge` — purge expired exact activation coordinates.
