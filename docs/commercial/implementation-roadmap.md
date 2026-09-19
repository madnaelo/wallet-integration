# Commercial Implementation Status

This branch implements the fee-hardening, trusted revenue, branding and deployment
preflight work. It is not a production release, legal clearance or payout test.

## Implemented

- 0x fees use the sell token and must equal
  `floor(sellAmount * PLATFORM_FEE_BPS / 10000)`. Positive but incorrect amounts,
  conflicting fee shapes and mismatched denominations are rejected.
- Source-token fee conversions are visibly approximate. The destination
  "before fees" row is hidden when it cannot be reconstructed.
- Durable signed server quote evidence, V30 migration, authenticated history
  binding, idempotent records, independent settlement checks and bounded leases.
- Protected revenue dashboard/API, separate expected/accrued/received amounts,
  provider/chain/token/time breakdowns, verified volume, provider fee-validation
  failures and first-party quote/review/submitted/confirmed funnel.
- A shared brand contract across web, metadata, wallet connection, PWA and backend
  messages; custom brands require their own operator disclosure.
- Read-only deployment preflight checking customer resource isolation, reviewed
  targets, origins, credentials, provider policy, brand assets and evidence setup.
- Docker build context now includes its local dependency and provider policy;
  Compose forwards the new settings without changing existing release targets.

See [fee semantics](fee-evidence-semantics.md),
[revenue operations](revenue-accounting.md) and
[branding/preflight](branding-and-preflight.md) for mechanisms and commands.

## Evidence Boundaries

Browser-confirmed history never establishes received revenue. Finalized standard
ERC-20 treasury transfer logs can establish 0x receipt. LI.FI aggregate balances
and delivery status do not establish a transaction's integrator payout.
Native-token transfers need trace evidence; non-EVM sources need their own
independent adapters. Those fees stay `NOT_VERIFIED`, not estimated earnings.

`ACCRUED` is a separate supported state, but no current provider adapter emits it
without transaction-scoped accrual evidence. There is no invented accrual or USD
valuation. Limit-order fees are not part of this swap-quote revenue pipeline.

The quote-signing key is a server credential, not a wallet key. These controls
detect browser/database payload substitution; they cannot guarantee integrity if
the signing server, its secrets or the selected RPC itself is compromised.

## Verification And Rollout

See the [executed verification record](verification.md) for results and any
external-service limitations on the final audit run.

The repository's combined verification command covers frontend tests, preflight
tests, audit, typecheck, lint, production build, Playwright, backend tests,
SpotBugs and Compose validation. The additional database tests use only an
explicit disposable database. See the revenue runbook for the opt-in variables.

Revenue capture is disabled by default for backward-compatible rollout. Deploy
and configure the backend first, then enable matching frontend runtime settings.
When enabled, evidence-storage failure prevents a new quote from being returned.
This branch does not alter production deployment targets or enable blocked
providers. It must pass review before merging into the existing release branch.

No real-money transaction or customer deployment is performed by these tests.
Provider account eligibility, legal review, owner-approved payout testing and
customer acceptance remain separate release gates, not unimplemented substitutes
for the engineering requested here.

## Business Work Outside This Implementation

The proposed offer remains a [non-exclusive license plus setup](software-offer.md).
Before a customer handover, review dependency/source/asset licensing and the
sanitized delivery artifact; exclude private Git history, secrets and regulatory
correspondence. Validate the offer through a scoped paid pilot before taking on
multi-tenancy, subscription billing or an open-ended managed-service obligation.
