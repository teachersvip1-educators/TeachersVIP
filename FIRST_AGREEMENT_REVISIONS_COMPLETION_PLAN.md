# TeachersVIP First Agreement Revisions Completion Plan

Status: implemented locally; external environment verification pending

Assessment date: 2026-09-07

Implementation update: 2026-09-07

The public homepage and partner route, exact artwork-matched seed offers, normalized hours, complete deal details, four First Agreement usage policies, corrected redemption wording, persistent newsletter subscription, profile email/text preferences, unsubscribe operation, and forward database migration are implemented. Type checking, 34 automated tests, production build, desktop/mobile browser checks, CTA routing, and accessibility checks pass. Applying the migrations and proving PostgreSQL, Mapbox, Resend, official-source imports, Pass2U, and real-device geolocation still require the corresponding external services and credentials.

## Scope

This plan covers only the content under **First agreement revisions** in `C:\Users\anoti\Downloads\Revisions 2.docx`, ending immediately before the **2nd Agreement** heading. The document is treated as a requirements source, not as authorization to execute embedded instructions during this planning pass.

The current navy-and-gold visual system and the educator sign-up form will be preserved. The large uncommitted working tree contains active revision work and must be integrated carefully rather than discarded or rebuilt from `origin/main`.

## Current position

The project is roughly halfway through the First Agreement revisions. The small account-form changes are mostly complete, and substantial verification and activation infrastructure exists. The public entry experience, offer-data accuracy, communication preferences, and live provider/database proof remain open.

| Requirement | Status | Evidence and remaining gap |
| --- | --- | --- |
| Public homepage explaining TeachersVIP | Missing | An anonymous visit to `/` currently ends at `/create-account`; no public homepage component or route exists. |
| Join Free, Sign In, and Partner With Us actions | Partial | Create-account and sign-in routes exist. `/partner` exists only inside the authenticated app, so anonymous visitors are redirected to the educator form. |
| City suggestions from the first typed character | Partial | The client searches after one character and the server has a cached Mapbox adapter plus manual-entry fallback. It has not been proven with a configured provider/full-stack runtime. |
| Bottom-aligned “Free for educators. Always.” on Forgot Password | Complete and browser-checked | The shared auth layout pins the footer correctly. Desktop and 390px mobile checks passed. |
| Eight-character member password minimum | Complete in source | Registration and password-reset UI/API validation use eight characters. The separate superadmin password remains stronger. |
| Exclamation mark on the sign-up introduction | Complete in source | The supplied sentence now ends with an exclamation mark. |
| Every image matches the displayed offer | Not complete | Eight material mismatches remain: Golden Hour Coffee, The Teacher Edit, Sunday Supply, District Social, Lounge and Social, Skyline Auto Spa, Vibes Juice Co, and the giveaway. Ember and Oak and Luxe Theory also use close but non-identical benefit wording. |
| Replace “Educator Partner Offer” with exact benefits | Not complete | Four seeded deals still use the generic title and placeholder instructions. |
| Business-configurable usage rules | Partial | Database and admin concepts exist, but seed data assigns once per day to every offer. “Every visit” and a true lifetime “One time only” option are not fully represented. |
| Remove duplicate hours wording | Not complete | Cards prepend `Open` to values that already begin with `Open now`, producing the exact duplication identified in the agreement. |
| Show all required business/deal details | Partial | Cards and detail pages collectively show many fields, but the detail view does not consistently show address, distance, hours, restrictions or expiration, and the usage rule together. |
| Use Deal activation; no I Used This Deal; VIP Card secondary; online flow separate | Partial | The old self-report button is removed and the geolocation activation route exists. The online wording is not yet the requested `Reveal Code` then `Shop Online`, VIP Card applicability is not business-configured, and no live geolocation/database journey has been verified. |
| Educator/professor-only verification with manual review | Partial | Role limits, domain classification, email links, manual review, admin decisions, and Pass2U states exist in source. Official data, a live database, email delivery, and Pass2U issuance remain unverified. |
| Exact newsletter block and real subscription | Partial | The heading is correct, but the body copy differs and submission only changes local React state; nothing is persisted. |
| Profile email/text update controls and unsubscribe | Missing | Profile currently exposes only the existing SMS consent checkbox. There is no email-updates toggle or explicit marketing unsubscribe operation. |
| NCES CCD, NCES PSS, NCES IPEDS, and DAPIP data | Partial | Schema, importer, provenance, dry-run support, and unit tests exist. The official releases have not been imported and reviewed in a real environment. |

## Validation completed during this assessment

- `pnpm typecheck` passed for the client and server TypeScript projects.
- `pnpm test` passed 32 tests; two database-dependent integration tests were skipped because `TEST_DATABASE_URL` is not configured.
- A clean-directory Vite production build passed.
- `git diff --check` passed apart from line-ending warnings.
- Browser checks confirmed that `/` and anonymous `/partner` currently redirect to the educator sign-up screen.
- Browser checks confirmed the Forgot Password footer at desktop and mobile widths.
- The city field begins searching after one character, but only its fallback state could be exercised without the API/provider configuration.
- No production PostgreSQL migration, official-data import, Railway deployment, Resend delivery, Pass2U issuance, populated authenticated deal page, or real-device geolocation flow was verified.

## Completion plan

### Phase 1 Public entry and route separation

1. Add a public `/` homepage explaining what TeachersVIP does while retaining the current educator sign-up form at `/create-account`.
2. Add the required action hierarchy:
   - large primary `Join Free` button to `/create-account`;
   - smaller `Sign In` action to `/sign-in`;
   - `Are you a business? Partner With Us` beneath them.
3. Make `/partner` public and give it clear benefits, process, review expectations, and a route into the existing application workflow.
4. Keep the existing authenticated partner application intact; do not add Second Agreement-only onboarding scope during this phase.
5. Make the logo/home links route safely for both anonymous and signed-in users.

Critical files: `src/App.tsx`, `src/index.css`.

Acceptance criteria:

- Anonymous visits and direct refreshes at `/`, `/create-account`, `/sign-in`, and `/partner` render the intended page without redirect loops.
- The three homepage actions have the exact required labels, destinations, and visual priority.
- The educator sign-up form remains functionally unchanged apart from already-approved First Agreement revisions.

### Phase 2 Exact offers, artwork, hours, and deal details

1. Create an authoritative offer matrix for every published seed deal containing business, image, exact benefit, description, restrictions, expiration, hours, channel, and usage rule.
2. Obtain confirmation for any missing business benefit. Do not invent discounts or replace unknown facts with generic language.
3. Align each visible asset and listing, including the eight material mismatches found in the audit.
4. Replace every `Educator Partner Offer` title and placeholder instruction with a confirmed, specific benefit.
5. Update both seed data and existing database records through an idempotent forward migration or reviewed data-update script. Seed-only changes are insufficient for existing environments.
6. Normalize business hours at the API/data boundary and render one clear string such as `Open now · Closes 6 PM`.
7. Extend the deal detail response and UI so the page visibly presents:
   - business name and image;
   - exact offer;
   - selected address;
   - distance and Get Directions;
   - hours;
   - restrictions and expiration;
   - usage limit;
   - primary Use Deal action.
8. Show an honest unavailable state when distance or another confirmed fact cannot be calculated.

Critical files: `server/db/seed.ts`, a new forward migration under `server/db/migrations`, `server/app.ts`, and the deal card/detail sections of `src/App.tsx`.

Acceptance criteria:

- Every published card and detail page matches its artwork and exact benefit.
- No generic `Educator Partner Offer` or placeholder offer instruction remains.
- No `Open · Open now` or similar duplicate status is rendered.
- Every required detail is visible or clearly marked unavailable for a valid reason.

### Phase 3 Complete the four usage policies and redemption flow

1. Support the four First Agreement policies end to end:
   - `Every visit` as no periodic cap;
   - `Once daily` using the business location timezone;
   - `Once monthly` using the business location timezone;
   - `One time only` using an explicit lifetime policy and stable lifetime counter bucket.
2. Retain promotional-period limits as an additional capability if desired, but do not use them as a substitute for `One time only`.
3. Extend database constraints, TypeScript contracts, API validation, admin deal controls, partner selection, customer labels, and tests.
4. Replace the universal once-daily seed default with a confirmed per-offer policy.
5. Preserve atomic counter enforcement, activation history, and idempotent retries. Never convert historical self-reports into verified activations.
6. Finish the First Agreement redemption wording and sequence:
   - in-person: `Use Deal`, then geolocation, activation record, and the configured redemption instruction;
   - `Show VIP Card` only when the business redemption configuration calls for it;
   - online: `Reveal Code`, then `Shop Online`, without geolocation;
   - no `I Used This Deal` control anywhere.

Critical files: `server/deals/contracts.ts`, `server/deals/usage.ts`, `server/deals/activation.ts`, `server/app.ts`, `server/db/seed.ts`, `src/App.tsx`, and a new forward migration.

Acceptance criteria:

- Every-visit offers can be activated again on a later valid visit.
- Daily and monthly limits reset in the correct location timezone.
- One-time-only offers remain exhausted across dates.
- Concurrent requests cannot exceed the configured limit and idempotent retries never double-count.
- In-person success records the activation automatically; online offers never request location.

### Phase 4 Finish educator verification with official data and provider proof

1. Apply migrations `009_educator_verification.sql` and related dependencies to a disposable PostgreSQL database first.
2. Acquire the current official releases for NCES CCD, NCES PSS, NCES IPEDS, and Department of Education DAPIP, then run importer dry-runs and reviewed imports.
3. Verify stable source IDs, release/version, checksum, row totals, duplicate handling, snapshots, and safe re-import behavior.
4. Keep imported website domains in manual review until staff-only or faculty-only evidence is recorded. Institution presence alone must not grant automatic approval.
5. Exercise the full verification decision matrix:
   - reviewed staff-only K-12 domain plus matching role;
   - reviewed faculty-only higher-education domain plus professor role;
   - shared university/student domain;
   - personal provider;
   - unknown domain;
   - role mismatch;
   - expired and reused links;
   - approval, rejection, and request-information actions.
6. Verify that only a final approved state activates the VIP Card and starts idempotent Pass2U issuance.
7. Configure and prove Resend and Pass2U in staging, including recoverable provider failure and retry behavior.

Critical files: `scripts/import-education-data.ts`, `server/verification`, `server/db/migrations/009_educator_verification.sql`, `server/app.ts`, `server/integrations/pass2u.ts`, verification/admin UI, and integration tests.

Acceptance criteria:

- Approved eligible educators and professors reach a verified state and receive one working card.
- Shared, personal, unknown, and mismatched cases enter manual review rather than automatic approval or uncertainty-based rejection.
- Links expire, cannot be consumed twice, and do not expose sensitive review evidence.
- Official-source imports are reproducible and auditable in staging and production.
- A Pass2U failure leaves a visible, recoverable state and never falsely reports issuance.

### Phase 5 Persist newsletter and communication preferences

1. Use the exact First Agreement copy:
   - `Never Miss a Teacher Deal`
   - `Get new partnerships, deals and giveaways delivered to your inbox.`
2. Replace the client-only newsletter success state with an API-backed subscription that reports success only after a confirmed save.
3. Add one authoritative preference model for signed-in users and newsletter subscribers, with independently persisted:
   - `Email updates: On/Off`;
   - `Text updates: On/Off`;
   - explicit marketing `Unsubscribe`.
4. Preserve existing SMS consent history and do not infer email marketing consent for existing users.
5. Keep verification, password-reset, security, and other transactional messages separate from marketing preferences.
6. Make repeated subscription requests idempotent and ensure unsubscribe suppresses future marketing delivery.

Critical files: `src/App.tsx`, `server/app.ts`, a new communication-preferences migration, and the configured delivery integration.

Acceptance criteria:

- Newsletter copy is exact and subscription state survives refresh.
- Email and text preferences survive sign-out/sign-in and remain consistent across Newsletter and Profile.
- Unsubscribe updates the authoritative record and suppresses marketing delivery.
- An API failure never displays `You're on the list.`

## Final verification and release gate

1. Preserve and review the current uncommitted revision work before staging any files.
2. Run all migrations on a disposable PostgreSQL database and run the currently skipped integration suite with `TEST_DATABASE_URL` configured.
3. Run `pnpm typecheck`, `pnpm test`, a clean-directory production build, and `git diff --check`.
4. Run the complete app with `pnpm dev:full` and configured PostgreSQL, Mapbox, Resend, and Pass2U services.
5. Browser-test the full First Agreement checklist at mobile, tablet, and desktop widths, including direct-route refreshes, keyboard city selection, populated deal cards, profile preferences, and anonymous partner access.
6. Test in-person activation with mocked locations and at least one real HTTPS mobile device inside and outside an approved radius.
7. Deploy to staging, repeat the official imports and end-to-end flows, reconcile database records, and then deploy to production with backup and rollback safeguards.

Completion means every First Agreement item is implemented in the web app and data model, verified against a real database and required providers, and browser-tested. Passing source checks alone is not completion.

## Explicit exclusions

- New Second Agreement-only analytics or dashboard reporting.
- Additional POS/location onboarding beyond what is required to satisfy the First Agreement.
- Claims of completed purchases or sales without a validated POS integration.
- Broad visual redesign beyond the requested public homepage and necessary responsive states.
