# Prompt 42 - Broad Asset Coverage With Confirmed-Fee Providers

Evolve Swap Assistant toward an all-token-to-all-token conversion experience
without taking custody, operating liquidity, or adding providers with unresolved
commercial fee terms.

## Requirements

1. Keep production quote routing fail-closed to providers whose fee collection
   is supported by unambiguous official documentation and recorded in the
   repository policy. Use 0x and LI.FI; do not route live quotes through 1inch,
   ParaSwap/Velora, or Odos while their commercial terms remain pending.
2. Support independent source and destination networks across the reviewed EVM
   registry, Solana, and native Bitcoin. Keep network, wallet, token, and
   recipient validation generic by address family.
3. Load searchable provider token catalogs, prioritize recognizable assets, and
   allow exact EVM contract-address or Solana mint-address lookup for supported
   tokens missing from the default catalog. Clearly mark address-added tokens
   and tell users to verify the address before approving a transaction.
4. Never claim that every issued token pair is executable. Ask providers for a
   live route and show a clear no-route result when liquidity, wallet support,
   compliance filtering, or route safety prevents execution.
5. Require the configured platform fee to be explicitly present in every
   returned 0x or LI.FI route. Reject a route that drops or changes the fee.
6. Isolate provider failures and rate limits so another approved provider can
   still return a quote. Protect the shared LI.FI key with a distributed global
   request budget and reserve capacity for backend transfer reconciliation.
7. Execute provider-returned Bitcoin PSBTs and Solana transactions only after
   strict source-wallet and transaction-integrity validation. Keep all private
   keys in the user's wallet.
8. Track cross-network delivery durably in PostgreSQL with bounded polling,
   retry backoff, worker leases, and confirmed, failed, or refunded outcomes.
   Browser polling is for immediate UX only; backend reconciliation remains the
   authoritative persisted state.
9. Add focused tests for token identity across address families, exact-address
   resolution, provider fallback, fee preservation, transaction execution, and
   route reconciliation. Verify desktop and mobile token-picker bounds.
