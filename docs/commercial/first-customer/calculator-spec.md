# Swap Cost And Break-Even Calculator: Decision Specification

October 24, 2026. **Specification and checked examples only; not implemented.**
Recommendation: one client-side manual-assumptions tool inside Swap Assistant,
not another exchange, journal, portfolio product or subscription. A later approved
implementation could use `/tools/swap-cost`; no route or SEO page is added here.

## Purpose And Search Intent

Help a holder answer: "How much of this amount is consumed by the costs I entered?"
and optionally "What reverse price would recover my starting valuation after
both legs' entered costs?" No wallet, live data, provider key, backend persistence
or execution. Results are assumptions, not current/executable prices or advice.

Candidates researched October 24: **crypto swap fee calculator**, **swap gas cost
percentage**, **crypto break-even calculator with fees**. Existing search results
include [TabChart](https://tabchart.com/tools/break-even-calculator),
[Cryptint](https://cryptint.io/tools/crypto-fee-calculator), and
[a crypto break-even tool](https://cryptocurrencycalculator.com/calculators/crypto-break-even-calculator).
These show tools already address fees/break-even; they are not search-volume,
ranking, demand, approval or conversion evidence. No competitor copy/formula is
used as implementation authority. Distinguishing value proposed here: explicit
fee denomination/valuation, fixed gas burden, already-net output and unknown costs.
One useful page, not mass token-pair SEO pages or promised search rankings.

## Inputs And Display Contract

- Choose one valuation currency (initially USD, AED or EUR as labels; no FX feed).
  All money entries use that currency. Currency changes clear monetary inputs
  after confirmation, never silently relabel USD as AED.
- `V`: source amount's user-entered valuation before deductions, strictly positive.
  It is not automatically the wallet balance, source-token quantity or live value.
- Forward costs: platform, provider, fixed gas (including approval if applicable)
  and other entered costs. Each cost has explicit amount OR rate, not both;
  percentage rows state their common base `V` and do not compound implicitly.
- Each forward cost is classified **deducted from the amount/output** or **paid
  separately**. Never assume provider fees, gas and platform fees use one token.
  V1 requires manual conversion to the selected currency and records the valuation
  assumption/time; it does not sum raw ETH, USDT and USD.
- Optional reverse section: net received destination quantity `Q`, unit label,
  optional entry valuation per unit `p`, reverse platform/provider rates on gross
  reverse proceeds, and reverse fixed costs valued in the selected currency.
- All rows start unknown, with an explicit "None / 0" choice. Blank is not zero.
  Known subtotal is shown as "At least ...; ... not entered." No complete total
  or break-even is shown when a required cost/quantity/valuation is unknown.
- Optional explanatory note: future gas/valuations may differ; a stablecoin is
  not automatically USD 1. Source and destination unit labels cannot change numbers.

Use existing page/navigation styles, labeled numeric inputs/steppers, currency
menu, a two-mode segmented control and an optional reverse-cost disclosure. Show
total entered cost and percentage prominently with its denominator. Do not show a
buy/sell recommendation, target profit, taxable gain or portfolio return.

## Two Explicit Quantity Modes

**Assumptions mode:** user supplies an illustrative entry unit valuation `p` in
the selected currency. Deducted fees reduce the amount available to acquire the
destination; separately paid costs do not. Derive `Q` once from these inputs.

**Already-net output mode:** user enters `Q` that already reflects the provider's
deductions. Deducted fee rows are informational for cost disclosure only; never
subtract them from `Q` a second time. Cost basis still includes only `V` plus
separately paid costs. Explain that spread/price impact may be embedded and cannot
be reconstructed from net output alone. If included fees are unknown, show a known
subtotal, not a complete total; for V1 hide break-even until all declared required
inputs are known rather than implying zero. Mode switch must not preserve stale
derived `Q` as a new authoritative input.

Do not import a live quote automatically in V1. A future quote-import adapter would
need denomination and included-versus-extra provenance, not a pasted headline rate.

## Mathematics And Units

All equations are definitions of this manual model, not price forecasts. Let:

```text
D = sum of forward costs deducted from V/output, valued in currency C
E = sum of forward separately paid costs, valued in currency C
K = D + E                             [C: total entered forward costs]
cost percentage = 100 * K / V          [% of pre-cost source valuation]
B = V + E                             [C: starting cost basis]
Q = (V - D) / p                       [destination units; assumptions mode only]
Q = user-entered net quantity         [destination units; already-net mode]
r = sum of reverse percentage fees / 100 [fraction of gross reverse proceeds]
F = sum of reverse fixed costs        [C, counted once regardless of payer]
reverse proceeds at unit valuation x = Q * x * (1 - r) - F   [C]
break-even x = (B + F) / (Q * (1 - r)) [C per destination unit]
entry-to-break-even change = 100 * (x / p - 1) [%; only if comparable p supplied]
```

Require `p > 0`, `Q > 0`, `0 <= r < 1` and `D < V` for a meaningful round trip.
If fixed gas exceeds V, cost-only output may exceed 100%; do not clamp/hide it.
Reverse fixed costs paid in an asset must first be valued manually in C using the
stated scenario. Amount-dependent/gas-dependent charges not fitting this linear
model remain unsupported/unknown; do not silently force them into a percentage.

The reverse output is **economic break-even in C at the chosen valuation**, not
guaranteed recovery of the original source-token quantity. If the source token's
price changes, that quantity can differ. V1 does not solve two simultaneously
moving token valuations or optimize a trade. If asked for source-token recovery,
require explicit source valuation assumptions or state it is out of scope.

Slippage tolerance is not a fee and is not added to K, D, E or F. Do not take a
minimum-received bound as the expected fill. Price impact/spread/unknown fees are
not zero merely because they are absent from the manual model.

## Worked Examples And Expected Results

All figures illustrative. No live prices or transactions.

| Case | Inputs | Expected result |
| --- | --- | --- |
| Sanity check | V=USD 300; separate platform rate 0.20% of V, deducted; gas USD 6 paid separately; all other costs explicitly 0 | D=0.60, E=6, K=USD 6.60, 2.2%; B=306. Without Q/p, no reverse result |
| Zero fees | V=300; all costs 0; p=100; reverse rate/fixed=0 | K=0, 0%; Q=3; break-even USD 100/unit |
| Small swap | V=10; platform 0.20%, gas=6; others 0 | K=6.02, 60.2%; not "0.2% total" |
| Fixed cost exceeds amount | V=2; gas=6 external; others 0 | K=6, 300%; do not clamp to 100% or promise a route |
| Percent + fixed | V=1000; platform 0.20% + provider 0.30% + fixed provider cost 1 deducted; gas 4 + other 2 external | D=6, E=6, K=12, 1.2%; B=1006; if p=100, Q=9.94 |
| Both legs | Sanity case plus p=100; reverse total rate 0.20%, fixed gas 6 | Q=2.994; B=306; x=312/(2.994*0.998)=104.417251336...; display USD 104.42/unit, +4.417251336...% (4.42%) |
| Check reverse result | Same both-leg case at exact x | Q*x*0.998 - 6 = 306; at entry x=100, net proceeds=292.8012, not break-even |
| Already-net output | V=300, Q=2.994 entered, informational included platform 0.60, gas 6 external; reverse rate 0.20%, fixed 6 | Same x as above, not Q=2.988 and not B=306.60; no double deduction |
| Fees paid separately | V=300, p=100; platform 0.60 + gas 6 both external; reverse rate 0.20%, fixed 6 | Q=3, B=306.60; x=312.60/(3*0.998)=104.408817635...; placement matters |
| Missing gas | V=300, platform 0.20%; gas blank | Known subtotal USD 0.60 (at least 0.2%); gas unknown, complete total and reverse result unavailable |
| Invalid inputs | V=0, negative, empty, NaN/Infinity, exponent, commas/overflow; p/Q zero; reverse total >=100% | Specific validation; no division by zero, fake 0%, negative output or executable claim |

Rounding occurs only at display. Proposed money display 2 decimals, percentages
up to 4, unit valuation up to 8 for small-priced assets; use "<0.01" for positive
sub-cent totals. Preserve full precision for intermediate calculations. Do not
present a rounded break-even as an exact threshold guaranteeing recovery.

## Existing Code To Reuse Or Deliberately Not Reuse

| Existing mechanism inspected | Decision |
| --- | --- |
| `src/lib/units.ts`, decimal strings/BigInt, `parseUnitsSafe` / `formatUnitsSafe` | Reuse formatting and strict token parsing conventions. `parseUnitsSafe` rejects zero: fee inputs need an explicit zero-aware wrapper, not a silent change to live swap validation |
| `src/components/FeeDisclosure.tsx` | Preserve visible approximate equivalents and suppression of unknowable before-fee destination output |
| `src/lib/server/quoteNormalization.ts`, `normalizeQuote` | Net output already incorporates provider deductions. Understand semantics; do not import server/provider modules into calculator client |
| `src/lib/quoteWarnings.ts` | Existing slippage and fee warning language/conventions, not a generic cost engine |
| `ReverseProfitCalculator.java` | Price-ratio estimate for existing alert thresholds; it omits complete entered forward/reverse gas/fee accounting. Do not advertise or reuse it as this calculator's all-in break-even engine |
| Existing navigation/layout and unit/UI tests | Reuse presentation/test setup; no wallet auth, account persistence or new API |

Smallest later implementation: one pure decimal/rational calculation module,
one client form and server-rendered explanatory page/metadata, focused unit and
browser tests. Use bounded decimal-string/fixed-point BigInt arithmetic, up to 30
fractional digits and a 40-character input cap, with explicit zero handling and
validation. Avoid binary floating-point for intermediate money math; no need to
add a dependency just for this specification. No service, migration or scheduler.

## Acceptance Tests For A Later Implementation

1. All numerical rows above match before display rounding; `x` substituted into
   the reverse equation recovers B within the defined precision.
2. Zero/unknown remain distinct; blank or partially typed input never flashes a
   complete zero-cost result. Explicit zero fee is valid while zero V is invalid.
3. Percentage input 0.20 means 0.20%, not 20%; platform/provider rates are separately
   labeled, their bases explicit, and each fee is counted only once.
4. Changing fee placement adjusts Q/B as above; already-net mode cannot re-deduct.
5. Mixed units, absent valuation, reverse sum >=100%, D>=V, negative/overflow and
   unsupported scientific notation fail clearly. Over-100% cost-only gas is valid.
6. Currency/mode switches cannot silently reinterpret amounts. No live price,
   tax calculation, expected slippage cost, return forecast or transaction is implied.
7. Tiny fees do not round to a misleading zero; no intermediate rounding drift.
8. No provider/backend/analytics request contains inputs; no cookies/localStorage,
   wallet access, credentials or persistence. Only static first-party assets load.
9. Keyboard labels/errors, 320/390/1440px layouts, results live-region and clear
   reset behavior work without horizontal overflow; accessible reduced motion.
10. A future Get Quote link is an optional new user action, never automatic
    execution, and does not claim the manual scenario is a provider quote.

Implementation decision is independent of consumer fee collection, provider-account
eligibility, revenue receipts, regulated operating permission and Radar licensing.
No restricted capability is enabled by this specification.
