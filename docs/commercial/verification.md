# Commercial Branch Verification

Executed on September 19, 2026 in the E:\assignments\wallet working tree.
These are engineering checks, not a legal review or real fee-payout test.

## Passed

- Frontend: 206 Vitest tests across 34 files.
- Deployment preflight: 5 Node tests, including fictional customer branding,
  protected-target conflicts and policy/credential failures.
- Type generation/typecheck, ESLint with zero warnings and Next.js production build.
- Playwright: all 10 acceptance tests, including 390px/1280px admin layouts,
  noindex, credential-storage boundaries, evidence inspection and lock-after-request.
  Screenshots were visually inspected.
- Backend: Maven clean verify, 200 tests with none skipped and SpotBugs with zero
  findings. Seven database tests used a disposable PostgreSQL 16 instance on
  localhost:56439, with separately created random schemas.
- V29-to-V30 upgrade with legacy duplicate transactions and browser-confirmed
  entries; only one unverified record was backfilled and no received fee invented.
- Runtime HTTP smoke: isolated Spring Boot and PostgreSQL; an ephemeral wallet
  signed an authentication message only. Signed quote ingestion and review worked.
  Duplicate history stayed one record; invalid HMAC, absent admin key and altered
  amounts were rejected. Browser-confirmed history resulted in zero independently
  confirmed swaps and null received revenue.
- GitHub Actions lint, shell lint, Dockerfile lint, cohosted deployment contract,
  all three Compose configurations, whitespace validation and staged Gitleaks scan.
- Linux frontend Docker build with only public synthetic settings. The resulting
  non-root container started successfully; its admin gate and PWA manifest passed
  HTTP assertions with external networking disabled. Packaging fixes include the
  local dependency, provider policy and shared chain catalog.

Unit/RPC/browser fixtures are synthetic. The only external provider probes were
read-only 0x quotes, documented in [fee semantics](fee-evidence-semantics.md).
No wallet transaction, approval, order or real-money transfer was submitted.

## External Audit Availability

The complete combined verification script passed after the initial fee review
fixes. During the final larger implementation rerun, npm's bulk advisory endpoint
returned HTTP 503 with an explicit maintenance response; npm's deprecated fallback
then returned HTTP 400. Repeated audit attempts and a minimal direct public-package
probe confirmed the upstream outage. The audit was NOT bypassed or reported as a
fresh pass. All local checks above were rerun individually after that interruption.
The existing CI audit gate remains enabled and must pass when npm recovers.
GitHub [CI run 182](https://github.com/madnaelo/wallet-integration/actions/runs/35458595363)
on implementation commit `770f65c` independently passed Backend, Repository
Quality and Docker Compose Config. Frontend unit/preflight tests passed; its
audit step failed with the same explicit npm maintenance HTTP 503, so subsequent
frontend CI steps were skipped (those steps passed locally as recorded above).

## Scope

No production secret files, release targets, blocked-provider policy or regulatory
records changed. Revenue capture remains opt-in for coordinated server rollout.
No customer infrastructure was provisioned. Independent evidence coverage and
configuration requirements are documented in [revenue operations](revenue-accounting.md).
