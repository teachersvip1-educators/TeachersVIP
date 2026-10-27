# Member updates and geolocation verification

Verified locally on 2026-10-28 before release.

- Optional personal offers email persists at signup and in Profile; school login and verification email remain unchanged. Alerts use the current preference, and RSVP/interest exports capture the selected email.
- All nine seeded sample businesses remain unpublished after migration and reseeding. The homepage uses published offers.
- US city and state labels, manual validation, and legacy US country suffix normalization were checked.
- The shared `demo@teachersvip.net` account signs in without educator verification and has read-only access. It cannot activate, RSVP, save, edit, issue a card or access admin data. Preview activity is excluded from member analytics.
- RSVP saves one submission, shows its thank-you on mobile, and attempts one confirmation email. Repeated clicks do not duplicate the submission or email; mail failure preserves the RSVP.

## Location checks

The real Fastify activation API was exercised against a temporary local PGlite PostgreSQL engine with the application migrations and seed code. Precise on-site observations succeeded. Outside-radius, coarse, stale, future-dated and zero-accuracy observations were denied without consuming usage or disclosing the redemption value. Usage limits, idempotent retries, unpublished businesses and revoked locations were also checked.

Controlled Chromium mobile tests exercised the actual React flow and local API. Permission denial showed recovery instructions; an outside reading showed the distance and denial. For a precise on-site reading, the browser was deliberately made to lose the response after the server committed. Retrying used the same idempotency key and recovered the successful activation. Two requests resulted in one successful activation.

The automated suite passed 134 tests, with 8 optional external PostgreSQL integration tests skipped because `TEST_DATABASE_URL` was not configured. TypeScript and the production client build passed. The local PGlite checks above are separate from those optional integration suites.

## Limits of this evidence

Browser coordinates were controlled test inputs. This does not establish physical iPhone/Android GPS accuracy or eliminate coordinate spoofing. A physical-device test at a participating location is still needed. Actual confirmation email delivery was not exercised against a real mailbox; the configured provider must accept the send before the UI reports an email sent. No local QA server, synthetic business or test member is part of the deployment.
