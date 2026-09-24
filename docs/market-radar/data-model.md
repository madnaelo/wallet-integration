# Data Model

Normalized definitions are in src/market-radar/types.ts.

| Structure                       | Meaning                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MarketInstrument                | venue, symbol, base/quote assets, market type, tick, quote turnover, best prices, discovery time             |
| OrderBookSnapshot / Delta       | absolute quantities, exchange sequence fields, observation timestamp                                         |
| PriceLevel                      | original decimal price and quantity strings; engine uses finite numeric values for analytics only            |
| Trade                           | ID, exchange timestamp, price, quantity, aggressive BUY/SELL/UNKNOWN                                         |
| VenueMarketState                | reconstructed levels, health, continuity quality, bounded trades/history                                     |
| DerivativesContext              | optional normalized extension; no derivative feeds are enabled in V1                                         |
| LiquidityZone                   | range, side, score, lifecycle, persistence, reliability, absorption, weighted venues, evidence               |
| SignalEvidence                  | component value, weight, contribution                                                                        |
| MarketRadarSnapshot             | canonical instrument, actual observedAt, calculatedAt, freshness, coverage, zones, CVD/profile/price context |
| PredictionAudit / SignalOutcome | immutable input signal and sampled subsequent outcome                                                        |

Pair key: BASE/QUOTE/SPOT. Venue key: venue/BASE/QUOTE/SPOT. Symbols are
discovered, not an asset allowlist. Matching names across venues is not contract
identity verification; see limitations.md. Currency thresholds are denominated
in the quote asset, not assumed USD equivalents.

## New migration only

V32__market_radar.sql creates a separate market_radar schema. V1-V31 are unchanged.

- latest: one compact snapshot per pair/audience.
- markets: qualifying discovery records with venue provenance.
- watches: bounded expiring on-demand requests.
- observations: sampled price/lifecycle, at most one row per 10-second bucket.
- signals: material immutable zone/snapshot, scoring version and configuration.
- outcomes: horizon, due time, lease, attempts, result and coverage status.
- events: material analytical transitions, durable fanout cursor.
- alert_rules: wallet ownership, event, score, cooldown and last delivery time.

No raw order-book tick storage. JSON inputs to persistence are server-created and
bounded at 128 KiB. Keys/indexes support audience/pair reads, retention, due audits
and restart-safe signal suppression. Retention defaults to seven days, configurable
2-90 days; backup retention is governed by the existing deployment policy.

The collector may read only pair_key from alert_rules, never wallet addresses.
The one-time provisioning script grants no privileges on public application
tables. Startup rejects elevated roles and accidental access to those tables.
