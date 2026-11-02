# Registration and interested educator checks

Checked locally on 27 October 2026.

## Changes

- Registration remains public, with school/educator email and eligibility guidance.
- Email confirmation always checks reviewed educator-domain evidence and role eligibility. The pilot bypass and its environment switch were removed; an old `EDUCATOR_ONLY_VERIFICATION=false` value no longer enables it.
- Personal, unknown, shared staff/student, and mismatched-role domains remain in manual review without a member card. Administrators can approve eligible educators after review.
- Verified members can reach offers and RSVP rather than being trapped on the confirmation page. The confirmation page retains its giveaway copy and adds a link to offers or the previously selected event.
- Interested Educators responses are tied to their event, business, CTA and page selection. Switching selections immediately hides previous rows and totals, cancels the superseded request, and prevents late responses from replacing current results. Filter options remain available after an empty result or request failure.
- CSV downloads use the same selected filters as the displayed list and bypass browser caching.

## Verification

- `pnpm test`: 98 passed; 8 database integration tests skipped because `TEST_DATABASE_URL` is unavailable.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `git diff --check`: passed.
- API regression checks cover ordinary email confirmation with the old pilot flag set to false, reviewed staff-domain approval, rejected expired links, protected interest submission, and matching event/business/CTA parameters for rows, totals and CSV.
- Agent-browser checks used controlled synthetic responses. Event A showed two submissions; event B showed one; an empty event showed zero totals and the empty state with export disabled. The CSV contained only event B. Rapid A-to-B switching retained B after the slower A response finished. A failed request cleared results while retaining filter options. Business filtering and the registration form were also checked at 375px without page overflow.
- With a controlled verified-member session, the full application opened an RSVP offer and displayed the saved confirmation after submission. The post-verification page displayed its offer/RSVP link. These checks validate client behavior; API authorization is covered separately above.

## Historical RSVP responses

The RSVP tab reads saved `offer_interest_submissions` from the database configured on the deployed application. Its default view includes confirmed RSVPs, invitation requests and older event waitlist signups, preserving each original response type. Expired or unpublished offers, a changed current offer type, and a member's current verification/card status do not hide retained submissions. Business/event/response filters apply equally to the list, totals and full CSV export; lists beyond 100 submissions are paginated.

This is a read-only compatibility change: it needs no data migration, provider login or manual import. It does not create event responses from account registrations, approval emails or the general platform waitlist. No client production records were queried or changed to validate this behavior.

## Account-only registrations and admin cleanup — 3 November 2026

- Admin RSVPs now has a separate **Registered only** list, backed by `/api/admin/registrations-without-response`. It reads existing non-demo, non-admin accounts with no saved event response, including older and unverified accounts. It does not assign those registrations to an event or count them as confirmed attendance.
- Registration name/email search, totals, pagination and full CSV export use the same database filters. Event selection remains independent, so selecting an empty event does not hide account-only registrations.
- Removed the Approved Email Domains panel, domain review forms and the frontend dependency on `/api/admin/domains`. The educator eligibility queue remains separate from the automatic verification logic.
- Added in-memory PostgreSQL route tests with 102 historical event responses and 125 account-only registrations. They execute the actual SQL and cover archived offers, changed offer types, unverified members, original response snapshots, pagination, search, filtered totals, CSV, and authorization. These fixtures are synthetic and do not access client data.
- Local browser checks exercised both database-backed lists, event/response filtering, registration search, empty events, mobile layout and removal of domain controls.

## Limits

The existing API already applies the selected event/business/CTA filters to rows, totals and CSV. The reported production mismatch was not reproduced against a live authenticated database; the client changes strengthen selection ownership and caching behavior, and regression checks protect the API filtering contract.

No deployment, live email delivery, production database checks or retroactive revocation of existing pilot-approved accounts were performed. The stricter policy applies to subsequent email confirmations. Existing approved memberships and historical interest records are preserved.
