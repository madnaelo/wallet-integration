# Fee Evidence Semantics

Reviewed September 19, 2026. Quote validation is not settlement proof.

## 0x

The [official EVM monetization guide](https://docs.0x.org/evm/0x-swap-api/guides/monetize-your-app-using-swap)
defines sell-token affiliate fees against `sellAmount`. Its buy-token examples
do not establish a universal equation for reconstructing the fee base from net
output, protocol fees and variable execution. We do not assume that equation.

This integration therefore requests `swapFeeToken = sellToken`. It requires
exactly one integrator charge, the requested token, a positive uint256 amount,
and `amount = floor(sellAmount * PLATFORM_FEE_BPS / 10000)`. Contradictory legacy
and array fields are rejected. Positive undercharges and overcharges fail too.
Quotes below one fee base unit fail closed, allowing another valid provider.

A read-only live quote corroborated integer rounding: a sell amount of
100000001 base units at 20 BPS returned 200000 units in the sell token. No wallet
signature, approval or transaction was performed. Unit tests use synthetic
fixtures; this observation does not prove any payout.

A second read-only ETH-to-USDT quote returned HTTP 200: 10000000000000000 wei
sold, the same transaction value, and exactly 20000000000000 wei of affiliate
fee at 20 BPS. This checks that the source-native fee does not add to the entered
sale amount. It is still only a quote, not an executed transfer.

Product impact: the treasury receives the source asset, not necessarily a stable
destination asset. The entered sell amount remains the total requested sale;
the affiliate fee is not silently added to that amount. Provider net output
remains authoritative. Native/internal transfers need stronger settlement
evidence than ERC-20 Transfer logs and must not be inferred from balances.

## LI.FI And Display

Source-token fees cannot reconstruct a hypothetical fee-free destination quote.
The UI hides that subtotal whenever fees use another token. Rate-converted fee
equivalents, including totals containing conversions, visibly say `Approx.`.
Original token amounts and provider net destination output remain unchanged.

LI.FI's [fee help](https://help.li.fi/hc/en-us/articles/21393182960795-Where-How-can-I-withdraw-the-collected-fees)
describes aggregate balances and withdrawal transactions. An aggregate balance
does not identify which individual swap accrued a fee. Its
[portal changelog](https://docs.li.fi/changelog/partner-portal) also records a
FeeCollector-to-FeeForwarder transition. Neither a successful delivery nor a
positive portal balance alone proves this application's per-swap fee payout.
