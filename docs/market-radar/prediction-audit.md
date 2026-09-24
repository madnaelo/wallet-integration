# Signal Audit

Material signals persist the canonical pair, observed reference price, range/side,
score, component values/weights, maturity/reliability multipliers, venue weights,
coverage, lifecycle, actual timestamp, scoring version and complete configuration.
Stable IDs and database uniqueness suppress duplicates. Unchanged material states
are suppressed; a score change of eight points, lifecycle change or scoring-version
change produces a new immutable signal. The bounded persistence queue samples at
most once every ten seconds per pair, rather than claiming to audit every tick.

Outcomes use observed price/lifecycle samples after RADAR_AUDIT_HORIZONS_MS
(default 1h, 4h and 24h; 1-6 distinct windows from 1 minute to 24 hours).
Each work item uses a fenced UUID lease, 180-second
lease, SKIP LOCKED claiming, bounded backoff and five attempts. Exhausted work is
FAILED, not silently retried forever. Audience isolation is preserved.

Contact must be observed within the initial horizon after the signal. If contact
occurs, evaluation continues for a FULL horizon after that first contact, bounded
to twice the original horizon. A late contact does not get miscounted as a failed
24-hour reversal after only a few minutes. Expected waiting reschedules the due
time without consuming a failure attempt. Results expose windowAnchor and
evaluationEndAt. No-contact windows finish at the original deadline. Coverage is
required throughout; the largest query remains bounded to 20000 sampled rows.

## Measured fields

- Observed entry inside the zone and first contact time.
- Break past the far edge and time.
- Whether WEAKENING was observed strictly before that break.
- Maximum penetration, reversal after sampled contact, continuation after break.
- Favorable/adverse excursion relative to the original structural direction.
- Sample count and maximum time gap.

These are descriptive structural observations, not hypothetical executed-trade
returns. Supply's structural direction is downward; demand's upward. Costs,
slippage and execution are not simulated. A sampled jump over the zone proves
a break, not an observed contact. Stale data is not counted as advance warning.

Missing samples or gaps above 30 seconds make a finished window INCOMPLETE_DATA.
Restart, inactive subscription downgrade and retention therefore limit valid
outcomes. No interpolation fills missing history. Raw ticks are not retained;
historical results are reproducible from stored compact signal and observation
inputs within retention, not arbitrary raw-order-book backtests.

## Operator report

Private collector endpoint:

```text
GET /internal/audit?minScore=80&minVenues=3&horizonMs=86400000&from=<epoch-ms>&until=<epoch-ms>
Authorization: Bearer <private operator token>
```

Time span is bounded to 31 days, score 0-100, venue count 1-3. Groups remain
separate by scoring version, zone side and outcome status. Counts include contact,
reversal of at least 2%, and advance weakening. Report incomplete/failed windows
beside complete observations; never turn a selected small sample into a marketing
success probability. No real 24h validation population was established by the
short V1 live probe. Public users cannot access this report.
