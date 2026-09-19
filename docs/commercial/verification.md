# Commercial Branch Verification

Executed on September 19, 2026 in the E:\assignments\wallet working tree.
These are engineering checks, not a legal review or real fee-payout test.

## Final Review Cleanup

The complete `scripts/verify.ps1` passed after the cached-quote and warning fixes:

- Frontend: 212 Vitest tests across 35 files, including source-token platform fee
  warnings at 100/150 BPS, the below-threshold case and no addition of overlapping
  source/destination fee percentages. Fee amounts and totals remain unchanged.
- Deployment preflight: 5 Node tests, including fictional customer branding,
  protected-target conflicts and policy/credential failures.
- npm dependency audit: zero vulnerabilities, with the audit gate enabled.
- Type generation/typecheck, ESLint with zero warnings and Next.js production build.
- Playwright: all 10 acceptance tests, including 390px/1280px admin layouts,
  noindex, credential-storage boundaries, evidence inspection and lock-after-request.
  Reused-quote fixtures show one quoted/reviewed route and two submitted/confirmed
  transactions. Both screenshots were visually inspected.
- Backend: Maven clean verify, 207 tests with none skipped and SpotBugs with zero
  findings. Fourteen database tests used a disposable PostgreSQL 16 instance on
  localhost:56439, with separately created random schemas.
- V29-to-V30-to-V31 upgrade with legacy duplicates; V30 was not edited. V31 keeps
  history and chain/transaction uniqueness and permits multiple records per quote.
- The PostgreSQL tests pass both distinct transactions through the real settlement
  verifier with synthetic RPC responses and stored signed quotes. Each needs its
  own finalized proof. Repeated transaction submissions never increase fee totals.
  Wrong fees, unfinalized blocks, another transaction's receipt, changed calldata,
  changed sender and out-of-window inclusion cannot borrow the other record's proof.
  An unfinalized second transaction reaches RECEIVED only after its own finality.
- Funnel quotes/reviews remain distinct; transaction counts and measured volume
  count both verified transactions. Authentication/binding, settlement checks and
  retry/lease implementation are unchanged.
- All three Compose configurations and whitespace validation passed.

## Earlier Runtime Checks

The earlier branch verification also recorded the following checks. These are
retained as historical evidence, not claimed as new real settlement tests:

- Runtime HTTP smoke: isolated Spring Boot and PostgreSQL; an ephemeral wallet
  signed an authentication message only. Signed quote ingestion and review worked.
  Duplicate history stayed one record; invalid HMAC, absent admin key and altered
  amounts were rejected. Browser-confirmed history resulted in zero independently
  confirmed swaps and null received revenue.
- GitHub Actions lint, shell lint, Dockerfile lint, cohosted deployment contract
  and staged Gitleaks scan.
- Linux frontend Docker build with only public synthetic settings. The resulting
  non-root container started successfully; its admin gate and PWA manifest passed
  HTTP assertions with external networking disabled. Packaging fixes include the
  local dependency, provider policy and shared chain catalog.

Unit/RPC/browser fixtures are synthetic. The only external provider probes were
read-only 0x quotes, documented in [fee semantics](fee-evidence-semantics.md).
No wallet transaction, approval, order or real-money transfer was submitted.

## CI Results

GitHub [CI run 183](https://github.com/madnaelo/wallet-integration/actions/runs/35458921216)
for `7639ced` completed successfully: Frontend (including the production npm
dependency audit), Backend, Repository Quality and Docker Compose Config.
The production dependency audit gate remains enabled; nothing was bypassed.

Historical context: [run 182](https://github.com/madnaelo/wallet-integration/actions/runs/35458595363)
for `770f65c` encountered npm's temporary HTTP 503 maintenance outage during its
audit step. The successful run 183 supersedes that temporary frontend CI failure.

## Scope

No production secret files, release targets, blocked-provider policy or regulatory
records changed. Revenue capture remains opt-in for coordinated server rollout.
No customer infrastructure was provisioned. Independent evidence coverage and
configuration requirements are documented in [revenue operations](revenue-accounting.md).
