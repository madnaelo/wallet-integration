# Mobile Push Subscription Failure

Status: paused on 2026-05-30.

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

## Next Resume Checklist

1. Inspect production backend logs for `Push diagnostic report` and
   `Push diagnostic entry` around the user's test time.
2. Add one temporary diagnostic route/page if needed that performs the minimum
   possible push subscription flow outside the large swap page.
3. Verify the exact deployed VAPID public key matches the private key used by
   the backend sender. Subscription creation should not require the private key,
   but mismatched production config can confuse later send testing.
4. Test whether changing the app origin/domain affects mobile subscription
   creation. Current origin is the Vercel subdomain.
5. Consider adding a generated PNG icon set to the web manifest. Current
   manifest icons are SVG; this should not normally block subscription, but
   Android PWA behavior is more reliable with PNG icons.
6. If still failing, add a user-facing fallback state: keep Telegram as the
   recommended mobile alert channel and mark mobile push as unavailable on this
   device after repeated `AbortError` failures.

## Current Product Decision

Pause deeper mobile push debugging for now. Telegram alerts are working and are
the reliable mobile alert channel until this issue is resumed.
