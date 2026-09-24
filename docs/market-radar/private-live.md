# Private Internal Live Radar

This extends V1 for the owner's internal research. It does not grant commercial
data rights, change provider policy, or introduce trading.

## Access

Open /admin/market-radar and use the existing admin access key. An ordinary wallet
session, anonymous request, query switch, or browser-only flag grants no access.
Every /api/admin/market-radar/status, /markets and /snapshot request calls the
existing constant-time AdminAuthService before accessing research. The existing
origin, no-store and admin rate limits apply. The page is noindex/nofollow.

The browser retains the key only in memory, sends it through X-Admin-Key, clears
the password input immediately, and forgets it on Lock/reload/navigation. It does
not put the key in URLs, storage, analytics, or the public bundle. Do not share
this full-privilege operator credential with ordinary users. This is the existing
operator mechanism, not a new multi-user employee identity system.

## Data Boundary

- Exact label: PRIVATE / INTERNAL LIVE DATA.
- Java internal flag defaults false; enabling it does not modify MarketRadarPolicy.
- TypeScript commercialRadarEnabled and permittedVenues remain unchanged.
- Collector is fixed to research/binance; Bybit and OKX remain policy-blocked.
- Public /market-radar and public APIs remain commercial-gated, never research fallbacks.
- /demo remains synthetic, noindex, with connect-src 'none' and its dependency preflight.
- Fresh research-only catalog/snapshot reads enforce Binance provenance, including
  contributing zone venues. Mixed/unapproved venues fail closed.
- The API returns bounded derived Radar output, not raw book levels or trades.
- Observations older than 15 seconds are not returned as current. Newly watched
  markets warm up for at least two minutes; weak depth can legitimately produce no zone.
- Single-venue confirmation is explicitly limited, never represented as multi-venue evidence.
- No research alerts are dispatched through public wallet alerts; no automatic trading.

V33 adds audience to the watch primary key; existing rows remain commercial.
Research and commercial budgets use separate transaction advisory locks and
audience-filtered collector reads. An internal watch cannot activate public alerts.
Existing V30/V31/V32 migrations are untouched.

## Controlled Deployment

Set repository variable MARKET_RADAR_INTERNAL_ENABLED=true and release a verified
master revision. CI builds/scans the isolated collector and the release deploys its
immutable GHCR digest alongside the exact frontend/backend revision. Turning the
variable off disables private reads and removes only the owned collector.

The helper runs under the existing shared-host deployment lock, after backend
health/Flyway verification. It modifies only labelled Swap Assistant containers
and its own egress network. It never changes shared ingress or unrelated services.

- Container: wallet-market-radar; no published ports or Caddy network membership.
- Private egress network: wallet-radar-egress; database network: existing wallet-database.
- Restricted PostgreSQL role: swap_assistant_radar_collector, connection limit 2.
- A one-time short-lived provisioning container receives DB admin credentials.
  The running collector never receives those, the app admin key, SMTP or provider secrets.
- Remote .radar-credentials is generated with secure randomness and mode 0600.
  Temporary env files are deleted; missing credentials for an existing role fail closed.
- Resources: 384 MiB memory, no extra swap, 0.5 CPU, 96 PIDs, read-only filesystem.
- Two dynamically selected continuous markets plus five on-demand markets,
  one venue, 200 book levels, two-minute minimum history, seven-day derived retention.
- Health requires actual received updates, not just a running HTTP server.
- Failed collector rollout restores the prior collector without stopping the swap API.

The normal public API, revenue accounting, SMTP, wallet auth, contact storage and
public alerts keep their existing release and security boundaries.

## Verification

Tests cover unauthorized/wallet-only access, valid admin access, disabled private
mode, both languages' closed commercial policies, audience-isolated watch quotas,
freshness, cross-audience fallback rejection, mixed-venue rejection, derived-only
root payload, responsive private view, locking and invalid authorization.

Production evidence must be gathered using the real owner credential without
recording it in Playwright traces/HAR/logs. Save only timestamps, venue provenance,
derived signal summaries, revisions, HTTP statuses and sanitized screenshots.
Do not label fixture-based browser tests as evidence of live exchange collection.
