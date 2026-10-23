# Verification And Review Receipt

October 24, 2026. Branch `feat/first-customer-package`, based on fetched
`origin/master` at `433b98fa683f13f8f21024219f0520239e022984`.
This package is review-only. The October 15 release is not awaiting a relaunch.

## Change Boundary

- One application fix: the existing server brand now supplies the synthetic demo
  heading. Default brand, CSP, noindex, hydration gate and client dependency
  allowlist remain unchanged. No configuration/env value was committed.
- Four SSR/branding tests, one fixture arithmetic regression and two viewport
  browser tests. The browser test records screenshots and blocks live traffic.
- One existing transitive dependency patch and one targeted runtime OS package
  update, described below; no new application dependency or runtime upgrade.
- Local commercial drafts and source-backed illustrative assessment. No price,
  marketplace listing, site-copy proposal or calculator was activated in the app.
- No backend source, historical migration, provider policy, legal record, revenue
  accounting, contact behavior, CI gate or deployment target was changed.

## Local Results

| Check | Observed result |
| --- | --- |
| `npm test -- --maxWorkers=1` | 314 passed; seven optional Radar database tests skipped because no isolated test database URL was supplied |
| Token registry isolated rerun | 10 passed |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed in the isolated source preview with non-secret example settings |
| `npm run build` | Passed, fictional-brand production build; 31 pages generated; no real environment files copied |
| `npm run preflight:demo` | Passed, unchanged 10-module demo dependency boundary |
| `npm run test:preflight` | 13 passed |
| `node --test docs/commercial/first-customer/arithmetic-check.test.mjs` | Seven passed; specification arithmetic, not an implemented calculator |
| `node scripts/check-npm-audit.mjs` | Passed after the single dependency patch; no new advisory exception |
| `git diff --check` | Passed |
| CI browser suite | 38 passed at the initial implementation head, including both new viewport tests; mocked contact/analytics and no real wallet/email/transaction |
| CI screenshot inspection | Three default-brand desktop captures reviewed; mobile test passed; stored reference captures are not the fictional-brand screenshots |
| Local fictional-brand desktop/mobile capture | Awaiting owner-started isolated preview; the tool rejected starting its local server |

An earlier two-worker full unit run failed a token-registry test after a five-second
timeout, followed by a fetch-count mismatch. The isolated test and subsequent full
single-worker runs passed without modifying token-registry source/tests or raising
timeouts. Resource contention is a hypothesis, not a proven cause. The rerun after
installing the patched dependency also passed 314 tests with the same seven skips.

The first preview build rejected an HTTP backend target outside development. It
was corrected to `https://backend.invalid`; no security check was disabled. Next.js
warned that the nested local snapshot shared a parent lockfile/workspace root. This
is a local fixture layout warning, not a production target change. The initial
successful build used the original dependency installation; the full patched
production build is independently exercised by CI.

## Security Gate Finding

The unchanged production npm audit reported `follow-redirects` 1.16.0 as high
severity via Axios. The official maintainer advisories identify 1.16.1 as patched:
[array-header handling](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-q3jh-wrc6-jgq8)
and [sensitive-header escaping](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-8r9p-f939-6h3c).
The maintainer pages label them moderate; the npm audit at inspection labeled them
high. Both exceed the existing moderate-or-higher gate. No exploit or actual
credential exposure in this application was established.

Only version/resolved URL/registry-verified integrity in that lockfile entry changed
to 1.16.1, within the existing `^1.16.0` dependency range. Installation used
`--ignore-scripts --no-audit --no-fund` and changed one installed package. Unrelated
platform metadata churn was removed. No forced upgrade, advisory suppression,
provider activation or production deployment was used to make the audit pass.

Initial CI then passed all 239 backend tests and SpotBugs but rejected the backend
image for `brotli-libs` 1.2.0-r1, reporting CVE-2026-111497 and fixed version
1.2.1-r0. The [official Brotli 1.2.1 release](https://github.com/google/brotli/releases/tag/v1.2.1)
documents that security fix. Added only `brotli-libs` to the Dockerfile's existing
targeted `apk upgrade` list. The pinned Java base, application code and scan policy
are unchanged. The subsequent CI image rebuild and unchanged vulnerability scan
both passed, followed by Flyway/application startup verification. This is CI image
evidence, not evidence that the patch is deployed to production.

## Evidence Classification

- **Inspected source:** sample assessment claim register SA01-SA09 and existing
  commercial/legal/provider records, tied to the baseline above.
- **Executed locally:** test/build commands in the results table. Arithmetic uses
  deterministic fixture/rational values; it does not fetch prices.
- **Authenticated read-only evidence:** existing marketplace Catalog entry was
  available. This is not KYC, work eligibility, payout setup or listing approval.
- **Operational email evidence:** stored privately; no account/key identifiers or
  customer records in this package. The owner deferred the separate provider
  investigation. No fresh email or inbox-delivery test was performed.
- **Proposals:** AED 1,000 review, optional pilot credit, USD 275 marketplace price,
  delivery assumptions, site copy and manual calculator. None is a new agreement.
- **Unverified:** real customer interface, wallet compatibility, provider approval,
  licensing/legal classification, customer deployment, real transfer/payout,
  customer demand, paid conversion and measured delivery time.

## CI And Review

[PR #61](https://github.com/madnaelo/wallet-integration/pull/61) is a draft pending
the final screenshot/package receipt. Initial implementation head:
`f86e8f7ff6dcef42ba2d5a33a14dc13c05883787`.

- [CI](https://github.com/madnaelo/wallet-integration/actions/runs/40020145154)
- [Security](https://github.com/madnaelo/wallet-integration/actions/runs/40020145109)

At that initial revision Security passed. CI passed frontend (314 unit tests,
13 preflight tests, build, lint, typecheck, audit and 38 browser tests), Radar,
repository-quality and compose jobs. Backend passed 239 tests/SpotBugs but failed
its image scan as documented above. No overall CI pass is claimed for that run.
The image-only follow-up is `c425a17863cc2d7963ae14ff89265dc824a1a396`:
[CI](https://github.com/madnaelo/wallet-integration/actions/runs/40020636108),
[Security](https://github.com/madnaelo/wallet-integration/actions/runs/40020635984).
Both follow-up runs completed successfully: all five CI jobs and all six Security
jobs passed. Backend runtime image scan and Flyway/application startup are green.
The final package commit adds documents/evidence only and receives its own checks.

Use the final PR head/check status for merge review. Existing CI independently runs
backend/database, Radar, frontend/browser, compose and security checks. No skipped
local database test is counted as an executed local pass.

Production remains unchanged. Vercel Git deployment is disabled in `vercel.json`;
the controlled production release workflow is not triggered by this review branch.
No feature flag, secret, DNS, provider right or regulated operating record changed.
No diagnostic email, prospect message, real wallet, trade or payment was used.
