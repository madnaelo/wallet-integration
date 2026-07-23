# Mobile Push Subscription Failure

Status: application-side fix implemented on 2026-07-19; production
configuration reverified on 2026-07-23; physical mobile verification pending.

## Summary

Mobile push notification permission succeeds, the service worker is active, and
the browser exposes `PushManager`, but mobile browsers fail before a push
subscription endpoint is created. The backend is not reached for subscription
storage in the failing path.

Desktop Chrome push notifications work.

## Current Production Context

- Frontend/backend diagnostic commit: `bd0b8b8`
- Mobile hardening commit: `4cf066f`
- Frontend URL: `https://wallet-integration-theta.vercel.app/swap#preferences`
- Backend URL: `https://wallet-api.84-235-254-97.sslip.io`
- VAPID public key length in diagnostics: `87`

## User-Tested Remediation

The user already tried:

- clearing Chrome site settings,
- clearing Chrome cached data, cookies, and site data,
- updating Google Play Services,
- updating Google,
- restarting the phone,
- installing/clearing Firefox and retrying.

The issue persisted.

## Chrome Diagnostic

Environment:

```json
{
  "url": "https://wallet-integration-theta.vercel.app/swap#preferences",
  "protocol": "https:",
  "hostname": "wallet-integration-theta.vercel.app",
  "isSecureContext": true,
  "notificationPermission": "default",
  "hasServiceWorker": true,
  "hasPushManager": true,
  "hasNotification": true,
  "displayMode": "browser",
  "isMobile": true,
  "isEmbeddedMobileBrowser": false,
  "userAgent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  "vapidPublicKeyLength": 87
}
```

Flow:

- session wallet was available,
- support check passed,
- notification permission changed from `default` to `granted`,
- push config loaded,
- service worker was active and controlled the page,
- no existing push subscription was present.

Failure:

```json
{
  "name": "AbortError",
  "code": 20,
  "message": "Registration failed - push service error",
  "causeName": "",
  "causeCode": "",
  "causeMessage": ""
}
```

The same `AbortError` occurred after a short retry and after service worker
reset/re-registration.

Final normalized failure:

```json
{
  "name": "PushSubscriptionSetupError",
  "message": "Registration failed - push service error",
  "causeName": "AbortError",
  "causeCode": 20,
  "causeMessage": "Registration failed - push service error"
}
```

## Firefox Diagnostic

Earlier Firefox mobile testing returned a frontend TypeError because
`pushManager.subscribe()` returned `null` and the diagnostic code attempted to
read `endpoint`. Commit `4cf066f` fixed that by treating a null subscription as
`PushSubscriptionUnavailableError` and by passing the VAPID key as a
`Uint8Array`.

After clearing Firefox and retrying, the user reported the same `AbortError`
shape as Chrome. The pasted later Firefox diagnostic had a Chrome user agent, so
verify the browser/user-agent again when resuming.

## What Is Ruled Out

- Backend authentication is not the primary failure point.
- Backend subscription storage is not reached before failure.
- The page is HTTPS and a secure context.
- Service worker registration is present and active.
- Notification permission is granted.
- Missing Push API browser support is not the reported issue.
- A stale subscription was not present in diagnostics.

## Current Hypothesis

The failure is happening inside the mobile browser's push service registration
step, before our app receives a `PushSubscription`. It may be browser/device
push-service state, an Android/Google push-service restriction, domain/app
identity issue, or a subtle VAPID/service-worker compatibility problem not
visible from the current diagnostics.

Do not ask the user to repeat the same clearing/update/restart cycle first;
they already did it.

## 2026-07-19 Application Fix

The production VAPID configuration was verified without exposing key material:

- the frontend and backend public keys are identical,
- the deployed backend returns the same public key,
- the private key derives that exact P-256 public key,
- the decoded public key is a valid 65-byte uncompressed P-256 point,
- desktop subscription and delivery already work.

The configuration was checked again on July 23, 2026. The public key returned
by the production backend is valid, the service worker and manifest are
reachable, and recent production operations reported no failed notification
deliveries. These checks prove server readiness but cannot create or verify a
subscription on a physical mobile browser.

The client flow did not follow the strongest mobile browser lifecycle. It
requested notification permission separately, then fetched/prepared resources,
then called `PushManager.subscribe()`. That can detach subscription from the
user gesture required by mobile browsers. It also retried subscription several
times and unregistered/re-registered the service worker after a push-service
error.

The replacement flow now:

1. loads and validates the VAPID public key before the user can enable push,
2. prepares the active service worker and existing subscription in advance,
3. calls `PushManager.subscribe()` directly from the Enable action so that
   the browser owns both its permission prompt and push registration,
4. makes one registration attempt and never removes a healthy service worker
   in response to an upstream push-service error,
5. preserves an existing matching subscription and safely removes one tied to
   an obsolete VAPID key,
6. treats a subscription recovered by the browser as success, and
7. keeps device state disabled unless a real endpoint is returned and saved.

Focused tests enforce malformed-key rejection, existing-subscription reuse,
key-rotation cleanup, one-call subscription behavior, and no retry/reset loop.

The Preferences page also provides an authenticated **Send Test Notification**
action for a linked device. The backend:

1. accepts only an endpoint already linked to the signed-in wallet,
2. sends only to that exact device,
3. limits tests to one per wallet per minute, and
4. returns a user-safe error without exposing push-service diagnostics.

This matches the platform guidance that `subscribe()` should run in response
to a user gesture and use an active service-worker registration:

- https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe
- https://developer.chrome.com/docs/extensions/how-to/integrate/web-push

If the same Chromium `SERVICE_ERROR` remains after this release, it is an
internal failure of the browser's configured push service before our backend.
Chrome documents that its push service is selected by the browser and is not
controlled by the web application. In that case Telegram remains the reliable
mobile fallback while a second device/network or a future native application
path is evaluated.

## Verification Checklist

1. Deploy the application-side fix.
2. On the same mobile browser, open Preferences and tap Enable Push
   Notifications once.
3. Confirm that the browser permission prompt and subscription complete as one
   action and that the UI reports this device as connected.
4. Tap **Send Test Notification**, background the application, and confirm
   delivery on that exact device.
5. If Chromium still reports `Registration failed - push service error`, test
   one different physical device or network before changing application code.

## Product Fallback

Telegram alerts continue to work independently of browser push and remain
available whenever a device's browser push service cannot create an endpoint.
