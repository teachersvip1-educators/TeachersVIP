# Geolocation fix verification — 21 October 2026

The screenshot's low-accuracy response comes from the server's proximity check. The previous client sent the first `getCurrentPosition` observation, allowed a 30-second cached reading, and ended acquisition immediately. It provided no opportunity for a coarse initial fix to improve. The permission-error handler also depended on the browser exposing a global `GeolocationPositionError` constructor.

## Changes

- Acquire live high-accuracy observations with `watchPosition`, `maximumAge: 0`, and a 30-second overall deadline. Ignore invalid, stale, and implausibly future observations. Keep the best fresh reading while precision improves.
- Submit a confident on-site fix immediately. A precise outside fix goes to the server for a definitive denial. Otherwise, submit the best still-fresh reading at the deadline; never invent coordinates, accuracy, or observation timestamps.
- Reuse the existing server proximity policy from `shared/geolocation.ts`. The entire reported accuracy circle must still fit inside the configured radius. Server verification remains authoritative; the radius has not been enlarged.
- Start acquisition directly from the user action, without an asynchronous Permissions API preflight. Handle numeric browser error codes, including browsers without the global error constructor.
- Show acquisition progress, reported accuracy, permission-setting guidance, and distance from the selected business when outside. Support cancellation and retries. Stop the watcher and timer on completion, cancellation, and navigation.
- Prevent duplicate requests and changing the selected business location during verification or after activation. Cancel stale detail fetches and clear activation state when changing offers. Online offers still bypass geolocation.
- Preserve structured server error details in `ApiError`, so the interface can explain uncertainty rather than displaying only the generic message.

## Verification

- Frontend and server TypeScript checks passed.
- Production Vite build passed.
- Focused tests: **33 passed**, covering acquisition, proximity, activation enforcement, API diagnostics, and usage policy. Database boundaries in the activation unit tests are stubbed; the real activation service and proximity validation run.
- Full suite: **85 passed, 1 failed, 8 skipped**. The unrelated failure is `server/deals/interests.test.ts:64`, which expects `['event']` while CSV export supplies `['event', null, null]`. Both that test and its server implementation are unchanged from base commit `ef5ded4`. Database integration suites were skipped because `TEST_DATABASE_URL` was unavailable.
- `git diff --check` passed.
- Read-only production check confirmed the screenshot's offer has coordinates `29.934147087549, -95.248639723487`, an attached participating location, and a **150 m** radius. No production data was modified.

## Mobile browser checks

Ran the actual React application in Chromium at 390 × 844, using a local QA API and controlled browser location callbacks. The QA API used the same proximity validator. These checks demonstrate browser/application behavior; they do not establish physical iPhone GPS performance or authenticated production database behavior.

| Scenario | Observed result |
| --- | --- |
| Initial accuracy 900 m, followed by 8 m on-site | Progress shown; no activation request for the coarse fix; exactly one request using the 8 m fix; Location Verified shown; watcher cleared. |
| Permission denied | Recoverable error and location settings help shown; Use Deal available again. |
| Retry, then cancel | Watcher cleared; progress removed; location selector and Use Deal enabled again. |
| Different selected location, approximately 2.2 km away | Server denial with distance; no redemption details; no horizontal overflow. |
| Navigate to another offer during acquisition | Watcher cleared and acquisition UI removed. |
| Online offer | Online Offer Access shown; no additional GPS calls. |
| Persistent 700 m accuracy through the deadline | Low-accuracy denial with ±700 m guidance; no redemption payload. |

Screenshots in this directory: `geolocation-improving-mobile.png`, `geolocation-verified-mobile.png`, `geolocation-permission-mobile.png`, `geolocation-outside-mobile.png`, and `geolocation-low-accuracy-mobile.png`. All show QA fixture data.

## Release and real-device confirmation

This report records local validation before release. Production deployment and physical iPhone behavior have not been verified by these checks. The local QA API must never be deployed.

After deploying the actual app, test Safari on the physical iPhone at the configured Humble site:

1. Allow website location and precise location. Tap Use Deal near the entrance. Confirm progress resolves to Location Verified and the correct participating address.
2. Deny permission, retry after allowing it, and confirm the action recovers.
3. Turn precise location off. Confirm uncertainty is explained and the offer remains locked when proximity cannot be established.
4. Test outside the radius, cancellation, navigation during acquisition, and an online offer.
5. Check authenticated activation records and usage counts in the production environment.

Browser software cannot force an operating system to grant permission or supply a precise GPS fix. The fix handles those states explicitly; a physical on-site Safari test remains required before claiming verified device behavior.

Reference: [MDN geolocation options and permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition), [MDN watchPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition).
