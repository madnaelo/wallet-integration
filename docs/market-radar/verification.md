# Market Radar Verification

Base master: 03e39e001f42e0b3ecf28ad173bef8f7cf6d3ca0.
Branch: feat/market-radar-v1.
Implementation verified: ba060b3417f5318a2f2f4a81a1f5c2c50a4af5ed.
Status: implementation CI and security passed; approved for private internal
testing, NOT commercial live data. Deployment follows the existing master release
gate. Exact deployed revisions must be checked against /api/health after release.

## CI and security

- [CI 35962056534](https://github.com/madnaelo/wallet-integration/actions/runs/35962056534):
  all five jobs passed (frontend, backend, Market Radar, repository quality, Compose).
- [Security 35962056508](https://github.com/madnaelo/wallet-integration/actions/runs/35962056508):
  Java and JavaScript/TypeScript CodeQL, Semgrep, Gitleaks and filesystem scans passed.
  Dependency Review is a pull-request-only check and did not run for this push.
- The first image scan correctly blocked Alpine OpenSSL CVE-2026-14456.
  libcrypto3/libssl3 were upgraded from 3.5.7-r0 to 3.5.8-r0; the subsequent
  image scan passed. No vulnerability exception or relaxed gate was added.

## SMTP prerequisite

Base CI35854662937, Security35854662970 and Release35854916382 succeeded.
Production contact submission returned202, persisted and delivered through the
authorized test SMTP account. User confirmed receipt; Yahoo classified it as spam.
STARTTLS/hostname verification retained. Inbox classification is not controllable
by application code; a dedicated authenticated sender domain remains advisable.
No sender credentials appear in this document.

## Executed evidence

- Production frontend build passed with /market-radar and isolated demo.
- 16 Chromium acceptance tests passed across existing flows and Radar at 1440/390/320px.
- Collector Docker build succeeded with isolated runtime dependencies (ws/pg).
- Full frontend suite: 292 tests passed, including actual isolated PostgreSQL tests.
- In CI, the frontend job runs 286 tests and skips the six database cases;
  the separate Radar job runs all 66 engine/transport/HTTP/database tests,
  including those six against its throwaway PostgreSQL service. They are not
  missing coverage and must not be double-counted as distinct tests.
- Earlier DB setup timeout under concurrent Docker/Java load was resolved by an
  isolated rerun; no production timeout or isolation guard was weakened.
- Backend verify: 217 tests passed, zero skipped; SpotBugs reported zero issues
  after fixing its findings. Includes V1-V32 migration and revenue regression tests.
- Typecheck, lint, production build, 5 deployment-preflight tests, 10-module demo
  dependency boundary, production npm audit and collector audit passed.
- All four Compose configurations and Dockerfile lint passed.
- Final collector image rebuilt locally after the security patch. Its disabled-mode
  /health returned UP under non-root, read-only, dropped-capability, no-new-privileges,
  384 MiB / 1 CPU limits; SIGTERM exited zero without OOM.

## Actual private live research, 2026-09-24

100-second Binance-only read-only probe:1366 dynamically discovered spot
instruments; configurable top1 selected USDC/USDT/SPOT, not hard-coded.
19 snapshots,974 received frames, one active subscription; zero observed gaps,
resyncs, malformed frames or stale books. Last snapshot LIVE/LIMITED_COVERAGE,
zero supply zones and one demand zone. Maximum compute3.1443ms.
No order, credentials, wallet, fees or public redistribution. Process stopped.
Bybit/OKX were not contacted because of policy restrictions.

Initial discovery exceeded8MiB; using official SPOT/TRADING exchangeInfo filters
and showPermissionSets=false fixed payload size without raising the bound.

A second 105-second probe exercised the actual compiled main process, private HTTP
health endpoint and restricted PostgreSQL role together: 1366 instruments discovered,
343 qualifying catalog rows, one detailed USDC/USDT/SPOT subscription, 1210 frames,
20 calculations, one latest snapshot, four persisted observations, one signal and
three pending outcome windows. Zero sequence gaps, resyncs, malformed frames,
calculation failures or persistence failures; reconnect counter was one. Maximum
compute latency was 5.09 ms. Pending windows are not completed outcome evidence.
Single-venue/minimum-history settings were explicit research overrides, not
commercial defaults. The process, temporary role and isolated schema were removed.

An earlier local attempt used a Windows-reserved port and failed with EACCES;
using an OS-allocated loopback port resolved it. This was not an exchange or
database failure. A separate probe left the default minimum-two-venue gate active
and correctly produced no qualifying persisted markets with only Binance enabled.

## Synthetic load

Final measured run: Node 22.22.3 on Windows, 10 markets x 3 venues, 150 levels/side,
5000 initial trades/feed, 30.003 seconds: 9000 updates (299.97/s), peak 111.64 MiB
RSS, CPU 4.657 seconds (15.52% of one core), 60 calculations, p50 11.59ms,
p95 27.97ms, maximum 48.53ms. An earlier run measured 107 MiB and p95 17.53ms;
host contention and warm-up affect results. Defaults remain 5 continuous plus
5 on-demand markets and a separate 384 MiB / 1 CPU collector limit.

This is in-process normalized replay, excluding network/TLS, PostgreSQL, multiple
replicas and customer HTTP load. It is not a production capacity/SLA claim.

CI Linux/Node 24.21.0 replay (same 10 x 3 fixture workload): 9030 updates in 30.10s,
300.00 updates/s, 197.30 MiB peak RSS, 1.359 CPU seconds (4.52% of one core),
60 calculations, p50 2.06ms / p95 7.70ms / maximum 15.25ms. Different runtimes
and hosts explain different memory/latency measurements; neither is a scale guarantee.

## Reproduction

npm test; npm run test:preflight; npm run preflight:demo; npm run typecheck;
npm run lint; npm run build; npm run test:e2e; npm run radar:build;
npm run radar:load; npm audit --omit=dev --prefix services/market-radar.

Use isolated loopback wallet_radar_test for RADAR_TEST_DATABASE_URL.
Existing Java clean verify uses isolated REVENUE_TEST_DATABASE_* variables and
runs new Radar + existing revenue migration/integration tests. CI provisions
throwaway PostgreSQL services. Never point test variables at production.

Screenshots are generated by e2e/market-radar.spec.ts in test-results and retained
as CI artifacts for 14 days. Desktop and mobile screenshots were visually reviewed.
The deployment acceptance suite repeats all 16 safe browser tests against the
public URL; the demo test asserts zero API/XHR/WebSocket requests, throwing wallet
getters, strict connect-src 'none', noindex, ephemeral state and no horizontal overflow.

## Release acceptance

Release only through .github/workflows/release-production.yml after the exact
master SHA passes CI and Security. Compare frontend/backend /api/health revision
with that SHA, verify /business and /demo#market-radar, and confirm
/api/market-radar/status reports commercial live disabled. Keep the collector
off on the shared production host until rights and resource activation are reviewed.
These are acceptance requirements; the final delivery report records actual release
run and deployed-revision results rather than implying that CI itself is deployment.
