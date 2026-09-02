# TeachersVIP V1

TeachersVIP is a responsive web application for verified educators to discover offers, display a personalized VIP card, reveal protected online promo codes, and self-report deal use and estimated savings.

## Current V1 boundaries

- Any syntactically valid school/work email domain is accepted during the testing period.
- Verification emails are sent through Resend when `RESEND_API_KEY` is configured.
- In development without Resend, the verification screen provides a local verification link.
- The personalized web VIP card is complete and remains the primary card.
- Pass2U automation is available when its API key and model configuration are supplied. The in-app card remains available if the provider is not configured.
- Deal use is self-reported. It is never represented as a confirmed purchase.
- A configured superadmin can manage businesses and publish, hide, and schedule deals from `/admin`; public Discover reads only currently active published records.
- Password recovery is available through the account email when Resend is configured.
- There is no business PIN, NFC redemption, geolocation check-in, POS integration, receipt upload, loyalty counter, Connected Passes feature, or public business onboarding.

## Local development

Requirements: Node.js 24+, pnpm, and PostgreSQL 17+.

1. Copy `.env.example` to `.env` and replace the development secrets.
2. Create the PostgreSQL database referenced by `DATABASE_URL`.
3. Run `pnpm db:migrate`.
4. Run `pnpm db:seed`.
5. Run `pnpm dev:full`.
6. Open `http://localhost:8443`.

The Vite client runs on port 8443 and proxies API requests to the Fastify service on port 8787.

## Resend

Set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_TO_EMAIL` — optional destination for new-user registration notifications.
- `APP_URL`
- `SUPERADMIN_EMAILS` — optional comma-separated personal account emails allowed to use the superadmin dashboard.
- `SUPERADMIN_REGISTRATION_PIN` — one-time setup PIN for `/admin-register`; set this in Railway and rotate it after setup.

`RESEND_FROM_EMAIL` must use a sender/domain that is verified in Resend before production email delivery will work.

For first-time setup, open `/admin-register`, enter the setup PIN, and create the administrator account. The route is backed by a database claim and becomes unavailable permanently after the first successful registration. The server, not the browser, enforces superadmin access. Never put a superadmin email list or setup PIN in a `VITE_` variable.

## Pass2U automation

Create a Pass2U membership-card model with three Dynamic fields and configure:

- `PASS2U_API_KEY`
- `PASS2U_MODEL_ID`
- `PASS2U_MEMBER_NAME_FIELD` (default `name`)
- `PASS2U_MEMBER_ID_FIELD` (default `memberid`)
- `PASS2U_STATUS_FIELD` (default `status`)

The field values must match the unique Dynamic field keys configured in Pass2U's Model Designer. The verified-user endpoint `POST /api/me/wallet-pass` creates the pass once, stores the returned Pass2U `passId`, and returns its public Pass2U download URL. Repeated requests return the same pass instead of issuing duplicates.

The API key is server-only. Store it in Railway variables and never expose it through a `VITE_` variable or frontend response.

## Railway

Create one Railway project containing:

- An application service connected to this repository.
- A Railway PostgreSQL service.

Reference the PostgreSQL `DATABASE_URL` from the application service and configure all values shown in `.env.example`. `railway.toml` builds the client, applies database migrations and seed upserts before deployment, starts the Fastify application, and uses `/health/ready` as the deployment health check.

Use separate Railway staging and production environments and databases. Configure backups and perform a restore test before launch.

## Commands

- `pnpm dev:full` — run client and API locally.
- `pnpm typecheck` — verify TypeScript.
- `pnpm test` — run unit tests; database integration tests run when `TEST_DATABASE_URL` is set.
- `pnpm build` — create the production client bundle.
- `pnpm start` — serve the production bundle and API.
- `pnpm db:migrate` — apply versioned PostgreSQL migrations.
- `pnpm db:seed` — idempotently seed the initial deal catalog.

Device-specific Apple/Google naming should still be withheld until the generated pass is validated on real iPhone and Android devices. The current UI accurately labels the action as Pass2U wallet issuance.
