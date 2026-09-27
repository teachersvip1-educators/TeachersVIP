# TeachersVIP admin triple-check — 27 September 2026

Scope: current local implementation, Chromium browser, real Fastify handlers and isolated PGlite PostgreSQL database. No production records were created or modified.

## Pass 1: UI and responsiveness
- Admin homepage, inventory and all three creation screens checked at 320, 390, 768 and 1440 pixels: no document horizontal overflow.
- All seven section routes opened at mobile width with their expected headings and no error notices.
- Weekly hours controls visually checked at 320 pixels: time values and picker controls fit.
- Fixed mobile admin scroll positioning so form controls and submit buttons do not land behind the fixed bottom navigation. Direct Add Location click after scrollIntoView verified.
- No browser runtime errors recorded.

## Pass 2: Actual browser submissions and readback
- Blank Add Business submission reports the required slug and focuses it.
- Business without coordinates saves successfully; category, timezone and weekly schedule read back from the database.
- Business draft survives reload.
- Duplicate slug produces a clear error, retains the form, and focuses the slug. Correcting the slug allows successful submission.
- Custom 08:30 opening time persists. Native time input exercised through its normal React input/change events because the CLI fill command does not support the browser's segmented time control correctly.
- Create Deal draft survives Add Business submission, returns with the new business selected, and retains title, description, category, savings and featured state.
- In-person Use Deal without a geocoded location produces a useful error and no partial deal.
- Add Location rejects a missing coordinate pair; supplying the second coordinate succeeds and returns to the preserved deal draft.
- In-person Use Deal and all three interest CTA types publish successfully and appear in admin API readback.

## Pass 3: Educator and persistence checks
- Anonymous RSVP shows signup/sign-in; an unverified member sees verification; verified member can submit.
- RSVP remains saved after reload, appears in the filtered admin list with one interested educator, and exports all seven CSV columns.
- Instrumented geolocation calls during RSVP submission: zero.
- Separate isolated database regression script passes all migrations, all three CTA registration gates, repeat-submission idempotency, no interest activation writes, normal Use Deal usage limits, hours validation/runtime status and location permissions.
- TypeScript, production build and git diff whitespace checks pass after the mobile scrolling fix.

Evidence: triple-responsive-results.json, triple-business-saved.png, triple-interest-admin.png, admin-weekly-hours-320.png and triple-rsvp-export.csv in this folder. All identities in these artifacts are generated test data.

Limit: production deployment, production migrations and live production form submissions have not been performed. Migrations 017–019 must accompany deployment.
