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

## Limits

The existing API already applies the selected event/business/CTA filters to rows, totals and CSV. The reported production mismatch was not reproduced against a live authenticated database; the client changes strengthen selection ownership and caching behavior, and regression checks protect the API filtering contract.

No deployment, live email delivery, production database checks or retroactive revocation of existing pilot-approved accounts were performed. The stricter policy applies to subsequent email confirmations. Existing approved memberships and historical interest records are preserved.
