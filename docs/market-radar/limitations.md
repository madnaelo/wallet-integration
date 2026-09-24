# Limitations and Interpretation

- Structural scores are deterministic heuristics, not probabilities or validated
  buy/sell predictions. No claimed win rate, profit maximum or guaranteed reversal.
- Visible orders are cancellable. Hidden/iceberg liquidity, OTC deals and other
  venues can dominate; public books cannot describe all market supply/demand.
- Aggregate wall behavior cannot prove spoofing, identify a trader, or precisely
  separate every cancellation from execution. Replenishment/consumption is sampled.
- CVD covers retained public executions; it is not global order flow.
- Discovery is dynamic spot instruments, not every token on every chain. Assets
  with insufficient turnover, depth, history or supported quote thresholds are
  excluded. Same tickers can refer to different assets; exchange metadata alone
  does not establish on-chain identity. Radar never chooses a contract address.
- Bybit continuity lacks a consecutive per-symbol gap proof; it is explicitly
  transport-only and discounted. Its live connector is policy-disabled.
- DerivativesContext is a normalized extension only. Funding, OI, perpetuals and
  liquidation streams are not collected or displayed by V1's spot-only adapters.
  Their separate market permissions/semantics have not been cleared. No future
  liquidation maps are invented.
- Only collected recent volume/price history is available, not institutional
  full-history volume profile. Restart resets in-memory persistence. Short-lived
  or downgraded markets produce incomplete audit windows.
- Audit uses10-second price samples, not tick-extrema. Missing contact between
  samples cannot be reconstructed. MFE/MAE are structural observations, not
  net trading returns. Retention bounds retrospective reproducibility.
- One collector instance per deployment. No distributed feed ownership or
  guaranteed horizontal capacity. The measured local load is not an SLA.
- Production live data remains blocked for all three venues pending written
  rights. Bybit/OKX correctness is fixture-tested, not live-certified.
- Telegram/email/push delivery still depends on user preferences and the existing
  channel capabilities. Cooldowns intentionally suppress repeated fluctuations.
- Get Quote requires the normal separate swap selection/review/approval flow.
  Market Radar never moves funds or automatically creates/executes an order.

These limitations are intentional boundaries, not hidden placeholders for
fabricated signals. Licensed derivatives/history providers may be evaluated later;
no paid subscription is required by this implementation.
