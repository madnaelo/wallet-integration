# Prompt 37 - Production PWA, Push Alerts, And Onboarding Polish

## Product Need

The product is no longer being treated as a throwaway MVP. The swap experience
needs to feel safer, clearer, and more production-ready on mobile and desktop,
with installable app behavior and browser push alerts alongside Telegram/email.

## Prompt

Fix mobile token-selector overflow, remove developer-facing wording from all
user-visible messages, add an intro/trust page, add a first-time guided Swap
tour, convert the app into an installable PWA, and deliver the same saved-swap
and favorite-pair alerts through browser push notifications. Keep the
non-custodial model explicit: connecting a wallet reads public address data,
sign-in stores history/preferences, and every transaction still requires wallet
approval.

Also resolve local PostgreSQL host-port conflicts by moving the local dev
Postgres port to an available port and updating every local script, default
config, and documentation reference. Do not change production or CI database
networking unless it directly depends on the local host port.

## Implementation Guidance

- Keep copy user-facing and trust-building; avoid terms like API calls,
  backend, database, dry runs, base units, or debug language in the UI.
- Reuse the existing notification scheduler, cooldowns, and outbox for browser
  push instead of creating a parallel alert engine.
- Store push subscriptions per signed-in wallet and support multiple devices.
- Keep VAPID private keys server-side only; expose only the public key to the
  browser.
- Add service worker, manifest, offline fallback, install prompt, and
  notification-click handling that opens a prefilled swap link.
- Add guided tour steps without blocking normal use, and remember when the user
  has completed the tour.
- Ensure token dropdown positioning is viewport-aware on small screens.
- Verify with typecheck, lint, frontend build, backend tests, and a mobile
  browser sanity check.
- Keep local dev port changes separate from deployment/CI behavior.
