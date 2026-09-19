# Revenue Evidence And Operations

## Trust And Data Flow

1. The Next.js quote server validates each provider's fee. It creates a versioned
   batch of quote snapshots and provider outcomes, signs the exact UTF-8 payload
   with HMAC-SHA256 and the `swap-revenue-v1\n` purpose prefix, and posts it to
   `POST /api/internal/revenue/quotes`.
2. The backend checks the signature, schema, amount basis and freshness (up to
   120 seconds old, at most 30 seconds ahead), then transactionally inserts the
   batch, quote snapshots and provider outcomes. Replays are idempotent.
3. The browser receives only opaque `revenueQuoteId` references. A signed-in
   wallet can record a review intent. Saving submitted history binds ownership,
   provider, both chains, asset addresses/decimals, amounts, fee BPS and exact
   transaction target/value/calldata hash to the server quote. History and
   revenue binding share a transaction.
4. A worker independently looks up the submitted transaction, revalidates the
   stored HMAC payload and transaction binding, and writes reconciliation
   evidence. Browser status is not used as settlement proof.

Important files: `src/lib/server/revenueEvidence.ts`, `api/quote/route.ts`,
`backend/.../revenue/RevenueIntegrity.java`, `RevenueService.java`,
`RevenueRepository.java`, `RevenueSettlementVerifier.java`, and
`db/migration/V30__trusted_revenue.sql`.

V30 backfills old non-dry-run history as `NOT_VERIFIED` without an earned amount,
deduplicating by source chain and transaction. New records are unique by history,
quote and chain/transaction. Missing quote evidence never adopts browser fee data.
A forged identity or conflicting transaction binding is rejected.

## States And Proof

| State | Meaning |
| --- | --- |
| EXPECTED | Submitted, bound server quote; fee is quoted, not earned proof. |
| NOT_VERIFIED | Missing/unsupported/inconclusive proof or exhausted retry budget. |
| ACCRUED | Independently documented entitlement, not receipt. No current adapter emits this without such evidence. |
| RECEIVED | Independently verified exact treasury receipt in the quoted fee token. |
| FAILED | Independently verified reverted source transaction. |

These are stages of one fee, not additive revenue categories. Expected amounts
remain the quote baseline even if a later record fails. Unknown amounts display
as unverified, not zero.

The 0x verifier checks RPC chain ID, transaction hash/from/to/value/calldata,
receipt, finalized canonical block and inclusion within the quote-binding window
(30 seconds before to 15 minutes after issuance). It nets incoming and outgoing
standard ERC-20 Transfer logs for the quoted treasury and token, requiring exact
agreement with the configured sell-token fee. It records block/receipt hashes,
transfer indices and amounts. This relies on the configured RPC and the token's
standard event semantics; it is not a token-contract audit or market valuation.

Swap completion and fee receipt are separate. Same-chain 0x ERC-20 destination
transfers must meet minimum output. Source volume is measured from actual net
token outflow and coverage is shown separately. Native amounts are not guessed.

LI.FI delivery can independently confirm completion for an EVM source, but its
aggregate integrator balance is not per-transaction fee proof. LI.FI fees,
native-token fees without trace proof, unsupported chains, non-EVM sources and
history without authenticated EVM-owner evidence remain unverified. See
[official fee evidence findings](fee-evidence-semantics.md).
The pipeline does not currently reconcile limit-order protocol fees.

## Concurrency, Retention And Privacy

Workers claim at most five records per run, using PostgreSQL SKIP LOCKED and
120-second UUID leases. Completion requires the current unexpired lease.
Retries use exponential backoff, capped at one hour, 12 attempts and 24 hours.
Unsupported proof is terminally unverified; transient RPC failures retry.
There is no admin endpoint that can simply declare an amount received.

Evidence is append-only in the application, with hashed provenance and duplicate
suppression. It is not immutable against a privileged database administrator.
Cleanup uses bounded batches. Unclaimed quotes expire after 90 days; signed
batches needed by a submitted transaction remain intact. Submitted accounting
evidence has no automatic deletion policy yet and requires an operator retention
decision. Back it up with the existing PostgreSQL backup workflow.

Funnel counts use persisted first-party quote batches/routes, authenticated
review intents, submissions and independent confirmations. Cached quote reuse is
not another quote request; a review means swap intent, not measured screen view.
Unsigned browsing is not tracked with an advertising identifier. Wallets and
transaction data are not sent to third-party analytics. RPC/provider requests
still carry the identifiers needed for their core service.

## Configuration And Rollout

Keep real values only in deployment secret stores or ignored environment files.

- `REVENUE_ENABLED=true`: set on backend and frontend runtime after migration.
- `REVENUE_INGEST_SECRET`: the same dedicated random secret (at least 32
  characters) on both servers, never a NEXT_PUBLIC value or admin key.
- `REVENUE_BACKEND_URL`: backend HTTPS origin on the frontend server. Local
  localhost/127.0.0.1 and Compose backend HTTP are allowed.
- `REVENUE_RPC_ETHEREUM_URL`, `REVENUE_RPC_OPTIMISM_URL`,
  `REVENUE_RPC_BSC_URL`, `REVENUE_RPC_POLYGON_URL`, `REVENUE_RPC_BASE_URL`,
  `REVENUE_RPC_ARBITRUM_URL`, `REVENUE_RPC_AVALANCHE_URL`: operator-owned
  read-only HTTPS RPCs on the backend. They must support the finalized block tag.
- `ADMIN_API_KEY`: existing protected admin credential.
- `API_REVENUE_RATE_LIMIT_MAX_REQUESTS`: dedicated ingestion limit, default
  600 per minute/IP, bounded to 6000.
- `REVENUE_CHECK_DELAY_MS`: worker interval, default 30000 ms.

Deploy backend/schema first, then enable the frontend. Disabled mode preserves
existing swaps but does not capture trusted evidence. Enabled mode fails closed
when quote evidence cannot be stored; it does not silently report untracked
earnings. Existing env examples and both deployment Compose files carry settings.
The production secret stores have NOT been changed by this feature branch.

Keep the signing secret recoverable in the secret manager and back up the
database. Current verification uses one key: rotating it invalidates old signed
payloads for future reconciliation. Coordinate rotation, retain the prior key
securely for an explicit migration, and never re-sign changed DB data as original
evidence. No automatic key migration is implemented.

Use `/admin/revenue`, enter the admin key, select a UTC window of at most 93 days.
The key stays in page memory, not localStorage or URLs; Lock clears it. The
dashboard is noindex and all data endpoints separately check admin authorization.
Records paginate by 100 (offset at most 10000), report groups cap at 1000, evidence
inspection at 20 entries. Narrow the window if the cap is reached. There is no
cross-token total or fiat conversion.

## Verification

Run `scripts/verify.ps1`. To include real PostgreSQL repository/concurrency tests,
set these only to a disposable `wallet_revenue_test` or `wallet_ci` database:

```powershell
$env:REVENUE_TEST_DATABASE_URL='jdbc:postgresql://localhost:56439/wallet_revenue_test'
$env:REVENUE_TEST_DATABASE_USERNAME='wallet_test'
$env:REVENUE_TEST_DATABASE_PASSWORD='your-disposable-test-password'
& ./scripts/verify.ps1
```

Tests create/drop only their random isolated schema. CI enables these tests on
its temporary PostgreSQL service. Unit fixtures include malformed/wrong fees,
signed-payload tampering, owner/transaction mismatch, finalized/reverted receipts,
missing proof, concurrent claims, stale leases, retry exhaustion, idempotency,
transaction rollback and report stages. They do not send real transactions.
