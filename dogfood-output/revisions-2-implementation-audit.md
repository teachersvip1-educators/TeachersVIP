# Revisions 2: implementation audit

Reviewed 27 September 2026 against the current local TeachersVIP checkout.

Source: [Revisions 2 Google Doc](https://docs.google.com/document/d/1698b1EQE7VhkuVTAEu5WFHq0x1ykdi1jVK_iBlzId4w/edit).

The document was read as requirements to compare, not instructions to execute. No application code or Google Doc content was changed during this audit. Document checkboxes were not treated as proof of implementation.

**Scope:** “Implemented” means present in the current local code. It does not mean confirmed deployed on teachersvip.net. Recent admin changes remain uncommitted locally, and migrations 017–019 must accompany their deployment. Existing browser/API verification is recorded in [admin-triple-check.md](./admin-triple-check.md). Live email delivery, Pass2U issuance, production database contents and physical-device geolocation were not retested in this audit.

## First agreement

| Requirement | Status | Finding |
|---|---|---|
| Public homepage before signup | Implemented | Public landing page explains the platform; Join Free, Sign In and separate Partner With Us page exist. |
| Join Free primary, smaller Sign In, business link underneath | Implemented | Landing-page hierarchy and destinations are wired. |
| City suggestions while typing | Implemented with limits | Autocomplete queries a provider and returns up to ten suggestions. Fallback contains a limited city list; universal city coverage is not guaranteed. |
| Eight-character member password | Implemented | Frontend and registration API use eight characters. Separate admin credential rules are unrelated. |
| Signup introduction exclamation mark | Implemented | Present in signup copy. |
| Every image/title matches actual offer | Partial | Golden Hour is aligned with Free Pastry, but giveaway UI hardcodes “Enter to Win a Classroom Toolkit” while seed data says “Monthly Giveaway: Lunch or Dinner for Two.” All production content has not been audited. |
| Replace generic Educator Partner Offer with actual benefits | Implemented in current supplied content | Specific offer titles/benefits are used; future content still depends on what admins enter. |
| Configurable every visit/daily/monthly/one-time usage | Implemented | Configurable limits enforced by activation service; promotional-period limits also available. |
| Remove duplicate open/hours wording | Implemented | Open status and hours are rendered together without the old duplicated status. |
| Business name, image, exact offer, address, directions, hours, restrictions, expiration and usage limit | Implemented | Deal detail exposes these fields when supplied. See content mismatch above. |
| Distance to business | Partial | Displayed distance is an admin-supplied string, not a live member-to-business distance calculation. Geofence distance is calculated separately during activation. |
| Primary Use Deal; remove I Used This Deal | Implemented | Activation is recorded by the activation service, with no separate confirmation button. |
| Online Reveal Code → Shop Online, no geolocation | Partial wording match | Online activation bypasses geolocation and Shop Online exists. Initial action currently says Use Deal, consistent with the newer CTA request, rather than the older document’s Reveal Code label. |
| Only educators/professors automatically verified; personal emails excluded | Partial, configuration-critical | Strict decision logic exists, but EDUCATOR_ONLY_VERIFICATION defaults to false. Pilot mode can verify personal email ownership. Deployment must explicitly enable strict mode to enforce the document’s rule. Current production configuration was not inspected. |
| Reviewed staff-only domains automatic; shared/unknown domains manual | Implemented conditionally | Correct strict-mode decision rules exist, including reviewed evidence and role checks. They depend on strict mode being enabled and registry evidence being populated. |
| Work-email ownership link and Pass2U card | Implemented integration; live unverified | Verification routes and Pass2U issuance/status handling exist. Successful production delivery/issuance was not demonstrated in this audit. |
| Official CCD/PSS/IPEDS/DAPIP database | Import capability implemented; population unverified | Import tooling and provenance schema exist. Complete production imports and domain-review coverage cannot be confirmed from the checkout. |
| Never Miss a Teacher Deal newsletter block | Absent following later revision | Commit 40413db removed this block. Prior task context records the later request to remove redundant newsletter UI while retaining city notifications. This should not be treated as an accidental omission. |
| Profile Email updates On/Off | Implemented | Profile control and API update exist. |
| Profile Text updates On/Off | Missing | No text-update control exists; profile save currently sends smsConsent: false. |
| Profile Unsubscribe | Implemented | Profile action and unsubscribe endpoint exist. |

## Second agreement

| Requirement | Status | Finding |
|---|---|---|
| Admin category dropdown | Implemented locally | Standard choices and existing categories available in business/deal workflows. |
| Automatic open/closed from hours | Implemented locally, data caveat | Weekly schedule plus timezone determines status. Legacy free-text hours require conversion to structured hours before automatic status applies. |
| Add Business from business selector | Implemented and locally browser-tested | Creates a business, returns to the preserved deal draft and selects the new business. |
| Add participating location | Implemented and locally browser-tested | Dedicated location screen returns to the deal draft; coordinate-pair validation works. |
| Whether latitude/longitude are necessary | Addressed | Business creation succeeds without coordinates. A geocoded participating location is required for in-person location-verified Use Deal offers. Interest CTAs do not need it. |
| Admin homepage with seven separate pages | Implemented and locally browser-tested | Overview; Educators; Businesses & Deals; Activity & Analytics; Reviews & Reports; Creator Network; Requests & Messages. |
| Separate Add Business/Create Deal screens | Implemented and locally browser-tested | Full forms no longer automatically fill the admin homepage. |
| Shorter labels, preserve controls, mobile/desktop layout | Implemented and locally checked | Businesses, Deals, Approved Email Domains and Platform Analytics. Existing admin controls remain. Previous QA checked 320, 390, 768 and 1440-pixel widths and all seven routes. |
| Notify Me When Deals Arrive | Implemented; delivery configuration dependent | Saves city and uses account email when no local offers are available. Delivery requires configured email service and marketing postal address; live sending was not verified. |
| Suggest a Business | Implemented | Educator submissions persist as private admin leads. |
| Only verified educators who activated that offer can review | Implemented | API checks successful activation of the specified deal, not merely any offer at the business. Reviews enter moderation. Strict educator verification caveat above still applies. |
| Report Review and admin approval/removal | Implemented | Reporting and moderation endpoints/UI exist. |
| Report an Offer with three requested reasons | Implemented | Expired, not honored and incorrect information supported, with admin resolution controls. |
| Compact footer with seven requested links | Implemented | About, Partner With Us, Creator Network, Contact, FAQ, Privacy Policy, Terms. |
| Private launch analytics | Implemented | Registered/verified educators, city counts, viewed/saved deals, onsite activations, online reveals, reviews, creator applications and inquiries; admin-restricted API. |
| User comments on reviews | Implemented | Verified users can submit comments; approved comments display publicly; admin moderation exists. |
| Exact About introduction and three platform parts | Implemented | Educator Membership, Business Partnerships and Teacher Creator Network content is present. |
| Creator homepage heading and Join button | Implemented | Requested heading and link to creator application form exist. |
| Creator application fields | Implemented | Name, city, educator email, contact, handles, platforms, audience range, niche, samples and opportunity preferences collected. |
| Private creator records and filters | Implemented | Admin filters support city, platform, niche and follower range. |
| No influencer-campaign business service yet | Matches scope | Interest collection exists; a campaign execution service is not part of this implementation. |

## Location-verified activation sequence

| Requirement | Status | Finding |
|---|---|---|
| Verified member taps Use Deal on physical offer | Implemented | Authentication/verification gate and primary action present. |
| Request current location and check specific location radius | Implemented | Browser request and server-side distance, freshness and accuracy checks exist. |
| Reject activation outside radius | Implemented | Server refuses invalid/outside/insufficient-quality location observations. |
| Save member, business, location, offer and timestamp | Implemented | Successful activation records include all identifiers and time. |
| Limited-time instructions/code/barcode and countdown | Implemented | Payload expiry is enforced; UI displays countdown and hides expired payload. |
| Cashier uses existing POS; no separate phone/scanner app | Matches scope | Instructions/code/barcode workflow needs no TeachersVIP cashier app. Business-side POS configuration is operational work, not automatically installed by TeachersVIP. |
| Daily/monthly/promotional limits | Implemented | Usage counters and enforcement exist. |
| Onsite totals, unique educators, repeat usage and business/location breakdown | Implemented | Private dashboard queries and UI support these measures. |
| Label as Verified On-Site Deal Activations, not purchases | Implemented | Wording distinguishes activation from a confirmed purchase. |
| Online offers require no geolocation | Implemented | Separate online activation path. |
| Exact purchase tracking via future POS API | Explicitly deferred | Not implemented, as the document describes this as a later optional enhancement. |
| Success Location Verified, secondary Show VIP Card, navigation VIP card | Implemented | Success sequence and card access present; Directions remains available. |
| Preserve navy/gold design | Implemented | Existing visual identity retained. |

## Additional requirements from this conversation

All four CTA types are present locally: Use Deal, Join Waitlist, RSVP and Get Launch Invite. Interest actions require a signed-in verified member, save member ID/name/email/business/offer/date, expose admin totals/list/CSV, and do not trigger geolocation or deal-activation writes. Local browser/API checks covered these flows. The same strict-verification deployment caveat applies.

Business creation was tested with the real Fastify handlers and an isolated PostgreSQL-compatible database: successful save/readback without coordinates, duplicate-slug error and recovery, retained drafts, weekly-hours persistence and return to the deal draft. This is local verification, not proof of a live production submission.

## Main code evidence

- `src/App.tsx`: homepage, signup, offer detail, profile, admin screens. Key findings: hardcoded giveaway titles at lines 2190/3038; profile smsConsent false at line 5697; online shop action around line 3216.
- `src/AdminWorkspace.tsx`, `shared/business-hours.ts`: admin sections, category choices and weekly-hours behavior.
- `src/LaunchFeatures.tsx`: city alerts, suggestions, review/report features, About, footer and analytics.
- `server/config.ts:22–27`, `.env.example:20`: strict verification default disabled.
- `server/verification/decision.ts`, `server/app.ts:2312–2314`: strict versus pilot verification decisions.
- `scripts/import-education-data.ts`: official-source import tooling.
- `server/db/seed.ts:24`: giveaway benefit differs from hardcoded UI title.
- `server/app.ts`: business/location persistence, reviews, comments, reports, notifications, creator records and private analytics.
- `server/deals/activation.ts`, `server/deals/geolocation.ts`: activation persistence, geofence checks, expiry and usage limits.
- `server/deals/interests.ts`, `src/OfferInterests.tsx`: interest CTA capture and administration.

## Outstanding priorities

1. Confirm production strict-verification configuration and official registry population; enable the requested educator-only policy when exiting pilot mode.
2. Add a real profile text-updates preference and stop unconditionally clearing SMS consent on profile save.
3. Remove hardcoded giveaway content so the displayed benefit matches the actual offer.
4. Resolve whether the older Reveal Code label and live distance display are still desired.
5. Deploy the recent admin work with its migrations, then verify production business submission, notifications and wallet issuance.

The removed newsletter block should remain a recorded requirements conflict unless the later removal request is reversed.
