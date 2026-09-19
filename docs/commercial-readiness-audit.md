# Commercial Readiness Audit

Reviewed September 19, 2026 against `748420b8938907877f1b273299e5b141ff5dbe74`.
This is a code audit, not evidence of a live fee payout, legal clearance, or a sale.

## Business Direction

The owner wants to sell the reusable product to businesses instead of relying
only on transaction volume. The attached implementation brief mostly covers
swap-fee accounting. These are separate revenue streams: a software license/setup
invoice is not an integrator fee. No customer license, exclusivity, price, or
subscription commitment has been agreed. Recommended starting offer: a
non-exclusive, separately deployed software license with a defined setup scope.

## Existing Flow

| Boundary | Verified implementation at the audited revision |
| --- | --- |
| Commercial policy | `config/provider-commercial-policy.json` allows only 0x and LI.FI. `providerCommercialPolicy.ts` rejects unconfirmed, unknown, and non-monetized live providers. |
| Fee configuration | `src/lib/server/platformFees.ts` uses `PLATFORM_FEE_BPS` (default 20, current cap 300), `FEE_RECIPIENT_ADDRESS`, and legacy `AFFILIATE_ADDRESS`. Only server-side code sends fee settings. |
| 0x request | `zeroxClient.ts` sends `swapFeeRecipient`, `swapFeeBps`, and `swapFeeToken=buyToken`. Fees are in destination-token base units; the request recipient is an EVM address. |
| 0x response | Requires a positive integrator amount in the requested fee token. It currently accepts any matching line and does not prove the configured rate or settlement recipient from the response. |
| LI.FI request | `lifiClient.ts` sends `integrator` and `fee=bps/10000`. Payout wallets are configured in the provider portal, not supplied through the browser or the EVM treasury variable. |
| LI.FI response | Checks integrator, fee fraction, and a fee-split allocation to that integrator of at least `floor(sellAmount*bps/10000)`. Preserves the shared request budget. |
| Quote resilience | `multiQuoteProvider.ts` uses independent timeouts and `Promise.allSettled`, ranks surviving routes by net output, and does not silently enable policy-blocked adapters. |
| User disclosure | `src/app/swap/page.tsx` shows a service-fee total and expandable fee details, but both integrator and provider charges are labeled generically. Returned net output is not reduced twice. |
| Persistence | `SwapHistoryService` authenticates the wallet, validates history inputs, applies a mutation lock, and limits payload/count. `SwapHistoryRepository` upserts by wallet/chain/transaction and preserves terminal states. |
| Status authority | The browser may submit `confirmed` history. A leased worker reconciles LI.FI cross-chain delivery. Neither fact proves treasury receipt, and browser history is not an authoritative revenue ledger. |
| Admin | `AdminAuthService` protects existing `/api/admin/*` controllers using a server-configured admin key. `OperationalMetricsService` contains process-local notification metrics, not durable revenue accounting. |

## Gaps To Address

1. Invalid numeric fee settings can silently become a default/zero or be rounded.
   A missing recipient disables the fee; an empty LI.FI integrator skips it.
   A monetized route must instead refuse execution when required configuration
   is absent. Provider-specific failure must not hide an unrelated healthy route.
2. Fee disclosures need explicit platform/provider/bridge identity. LI.FI split
   amounts must partition an existing cost, never add it a second time.
3. A trusted ledger needs server-originated quote evidence bound to wallet,
   chain, assets, amounts, fee configuration and transaction request. Copying
   arbitrary browser `quote_json` into a revenue table would create false proof.
4. Settlement verification needs a separate authority: independently checked
   transaction/provider evidence with deduplication and recorded provenance.
   Never promote browser `confirmed` or quote fee presence to earned revenue.
5. An admin report must group raw amounts by chain/token/decimals; it must not
   sum ETH and USDT or assume missing USD prices are zero. Expected, accrued,
   received and withdrawn are distinct stages, not additive income totals.
6. Branding is currently hard-coded across web, PWA, wallet metadata, backend
   messages and legal copy. A customer handover also needs isolated credentials,
   deployments, database, provider accounts and operator disclosures. A new logo
   alone is not a complete white-label product.

## Source And Verification Limits

- [0x fee guide](https://docs.0x.org/evm/0x-swap-api/guides/monetize-your-app-using-swap):
  request fee tuple and returned fee amount. Its worked arithmetic is for
  sell-token fees; do not apply that base-unit calculation to this app's buy-token
  fees or pretend it proves a transfer.
- [LI.FI quote reference](https://docs.li.fi/li.fi-api/li.fi-api/requesting-a-quote):
  integrator identification and fractional fee parameter.
- Existing operator/eligibility caveats remain in
  [earning setup](earning-setup-finalization.md) and
  [VARA response record](legal/vara-response-2026-08-27.md).
- No live swaps, fee claims, new provider approvals, customer agreements, or
  measured revenue were performed/obtained for this audit.

## Delivery Order

First fix configuration/disclosure defects with isolated tests and preserve the
current product. Then agree the software ownership/support offer and implement
coherent cross-stack branding and customer-deployment validation. Trusted fee
accounting is a separate implementation track; do not advertise it as complete
until quote provenance, reconciliation, migrations and admin reporting are tested.
