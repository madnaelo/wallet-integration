# Explainable Structural Score

Source: StructuralEngine in src/market-radar/engine.ts.
Version: structural-v1.0.0 plus a 12-hex SHA-256 fingerprint of sorted complete
configuration. Each snapshot stores that configuration. Change the base version
when changing formulas; never rewrite old signals.

Component values are clamped to [0,1]:

| Component        | Weight | Calculation                                                               |
| ---------------- | ------ | ------------------------------------------------------------------------- |
| Magnitude        | 20%    | log2(max nearby-band concentration ratio) / 4                             |
| Persistence      | 20%    | log(1 + minutes continuously concentrated) / log(241)                     |
| Cross-venue      | 20%    | sum aligned square-root-turnover weights times min(1, aligned venues / 3) |
| Executed history | 5%     | collected volume in zone / (3 times median populated profile band)        |
| Price structure  | 5%     | prior sampled swing contacts in range / 3                                 |
| Absorption       | 10%    | replenishing 1, consumed .05, otherwise .4                                |
| Reliability      | 10%    | 1 minus .2 times average suspicious cancellation/movement count           |
| Quality          | 10%    | healthy venues / 3 times history / hour times continuity factor           |

Continuity factor is 1 for sequence-verified feeds, .8 for Bybit's transport-only
continuity. Maturity = .25 + .75 * min(1, persistence / hour).
Final score = round(sum(component * weight * 100) * maturity *
(.5 + .5 * reliability)). Thus even a very large new wall is heavily discounted.

The UI exposes contributions and multipliers in Why this zone. Score history is
bounded to 24 calculations. A score of 84 is NOT an 84% reversal probability,
a trade recommendation, or validated predictive accuracy. Weights are explicit
engineering heuristics awaiting outcome evidence, not optimized claims.
