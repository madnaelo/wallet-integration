# Commercial Implementation Roadmap

Status after the first commercial-readiness pass. The owner's stated direction
is selling software; the attached ten-phase brief is retained as a technical
backlog, not misrepresented as completed work.

## Completed In This Pass

- Pre-change [implementation audit](../commercial-readiness-audit.md), including
  exact fee parameters, policy, treasury configuration, persistence and trust gaps.
- Strict whole-number fee parsing using the existing 300-BPS cap; explicit
  invalid/zero monetized configuration no longer silently becomes a different fee.
- Provider-local missing treasury/integrator rejection, preserving healthy-provider
  fallback. 0x checks one nonzero fee in the requested token, bounds its amount and
  rejects conflicting response shapes. This is not cryptographic payout proof.
- LI.FI allocations are disclosed as platform plus remaining provider/bridge cost,
  preserving total fees and net output. Invalid/missing parent cost is rejected.
- Visible platform-fee amount/percentage and separate provider labels; fee-page
  disclosure reads the same configuration validator.
- Deterministic tests for configuration, policy, malformed/missing fees, cost
  partitioning and failure isolation. Fee-validation errors have a distinct,
  redacted log type; logs are not a durable accounting system.
- Draft software offer and customer handover/acceptance checklist.

## Verification On September 19, 2026

- Frontend: 189 tests passed across 31 files (`npm test`).
- `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Backend: 172 existing tests passed using Maven offline and the existing Java 17
  toolchain. No production database was used; backend source/schema is unchanged.
- Browser: all 7 existing Playwright acceptance tests passed on local port 4189,
  including mobile picker bounds, sign-in gates, contact form and public metadata.
  These are mocked public-flow tests, not a connected-wallet fee-payout test.
- No real transactions, received revenue, new provider approvals or customer
  deployments were tested. The new work is isolated on `feat/commercial-readiness`;
  it has not been merged into the production release branch.

Non-blocking tooling messages: Vite warns about a future native configuration
loader default; the local browser runner reports conflicting color environment
variables. Neither was hidden or treated as a product failure.

## Next: A Coherent Licensed Deployment

1. Implement one branding contract covering web, wallet, PWA and backend messages,
   safe same-origin assets/support links, and documented operator/legal overrides.
   Keep treasury/provider policy server-only. Test a second fictional brand
   without publishing a customer deployment or changing production identity.
2. Add a customer deployment preflight that verifies isolation and rejects missing
   identity, credentials, allowed origins, fee configuration or release targets.
3. Review dependency/source/asset licensing and prepare a sanitized handover
   artifact; do not export the entire private repository history.
4. Validate the offer through a scoped paid pilot before adding multi-tenancy,
   subscription billing or an open-ended managed-service commitment.

## Separate Track: Trusted Revenue Accounting

Still unimplemented from the attached brief: durable revenue model/migration,
settlement reconciliation, protected admin dashboard and durable funnel metrics.
Do not use browser-submitted `confirmed` history as authoritative revenue.

The implementation must use server-originated quote evidence bound to the
authenticated owner and exact chain/assets/amounts/request, plus independent
settlement verification. Retain idempotency, transaction boundaries, provenance,
retry leases, bounded indexed aggregation and access checks. Old history without
evidence must stay unverified. Dry runs are excluded from earned revenue.

Use `EXPECTED`, `NOT_VERIFIED`, `ACCRUED`, `RECEIVED`, `FAILED` with documented
transitions and an audit trail. A refund may still incur fees: verify the actual
provider/chain result rather than automatically inventing a zero fee or payout.
Accrued and later received amounts are stages of the same fee, not two earnings.
Group raw amounts by chain/token/decimals; USD totals need price provenance and
coverage. Missing valuations are unavailable, not zero.

0x's buy-token response does not echo an independently signed treasury/rate
assertion. Current checks establish fee presence/shape, not exact settlement.
Resolve that evidence boundary before claiming the requested BPS or recipient has
been proven on-chain. LI.FI delivery completion similarly does not prove integrator
payout. Unprovable provider outcomes must stay `NOT_VERIFIED`.

Add the admin report only after those foundations: bounded pagination/time windows,
provider/chain/token breakdowns, expected versus verified settlement, failure
counts and privacy-conscious funnel metrics. No wallet addresses or transaction
contents should go to third-party analytics by default.
