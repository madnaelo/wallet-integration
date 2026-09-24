# Market Radar Operations

## Current rollout

Synthetic /demo#market-radar is ON. Commercial live is OFF. The optional private
workspace /admin/market-radar uses the existing X-Admin-Key protection, not wallet
connection or a query parameter. No exchange API keys are required.

- MARKET_RADAR_LIVE_ENABLED=false: both frontend server and Java.
- MARKET_RADAR_INTERNAL_ENABLED=false by default: independent Java private-read gate.
- RADAR_MODE=disabled: collector default; research only by deliberate operator choice.
- RADAR_VENUES=binance: only currently research-permitted adapter.
- Bybit/OKX and commercial collection fail startup if requested without code-reviewed rights.

The controlled release accepts repository variable MARKET_RADAR_INTERNAL_ENABLED=true
to deploy the bounded Binance research collector and open authenticated private reads.
It explicitly writes MARKET_RADAR_LIVE_ENABLED=false. Neither policy's commercial
venue allowlist changes. See [Private live deployment](private-live.md).

## Private research setup

1. Run the existing isolated/local backend so Flyway applies V32 and V33. Never reuse
   production DB credentials in an experiment.
2. Set RADAR_ADMIN_DATABASE_URL and a random RADAR_DATABASE_PASSWORD of at least
   32 characters privately. Run node scripts/provision-radar-role.mjs once.
   It refuses to overwrite an existing role; remove the administrator variable
   afterwards. It does not store or print either credential.
3. Set RADAR_DATABASE_URL for swap_assistant_radar_collector, RADAR_INTERNAL_TOKEN
   to a separate random secret, RADAR_MODE=research and RADAR_VENUES=binance.
   Set RADAR_MINIMUM_VENUES=1 explicitly for single-venue research; public remains off.
4. npm run radar:build then npm run radar:start. Defaults bind 127.0.0.1:8092.
   Use authenticated /internal/markets and /internal/snapshot?pair=BASE/QUOTE/SPOT.
   Never forward the collector's /internal endpoints through a public proxy.
   The Java /api/admin/market-radar endpoints authenticate each request before reading
   bounded, fresh Binance research projections from PostgreSQL.
5. Stop with Ctrl+C; graceful shutdown drains bounded writes. SIGTERM works in Docker.

For Docker, copy infra/market-radar.env.example into an ignored private environment
file and configure the existing database network name. Run:

```powershell
docker compose --env-file infra/market-radar.local.env -f docker-compose.market-radar.yml --profile market-radar up -d --build
docker compose --env-file infra/market-radar.local.env -f docker-compose.market-radar.yml --profile market-radar down
```

Compose project swap-assistant-market-radar, loopback port8092 and explicit external
DB network avoid changing or stopping other hosted projects. Validate port/network
availability first. The collector image contains only ws/pg runtime dependencies.
Do not pass the main application's SMTP, signing, provider or admin secrets.

## Tuning

radarConfig validates continuous/on-demand counts, venues, depth, TTL, staleness,
history, minimum history/venues, spread, compute interval, reconnect budget,
frame/buffer/trade/catalog limits and discovery interval. RADAR_MIN_QUOTE_VOLUMES
and RADAR_MIN_DEPTHS accept bounded JSON maps of quote asset to positive threshold.
RADAR_RETENTION_DAYS defaults7 and permits2-90. Root API watch count
RADAR_ON_DEMAND_MARKETS must agree with collector capacity.

API: /api/market-radar/status, /markets?q=, /snapshot?pair=; wallet-authenticated
GET/POST /alerts and DELETE /alerts/{id}. Existing origin/rate/session protections
apply. Private /internal/health and /internal/audit require the collector token.

## Licensed activation checklist

Retain written commercial/display/derived-alert permission, review both code
policies and terms dates, rerun fixture/live/load/security tests, provision the
restricted role, measure shared host headroom, align quotas, then explicitly turn
on approved venues and feature flags in a reviewed deployment. An environment
switch is not sufficient. Do not alter operator/regulatory records as a shortcut.

Rollback public flags first, stop only the separately named collector, preserve
compact evidence. V32 is additive; do not edit historical Flyway files.
