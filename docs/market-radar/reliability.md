# Reliability and Resource Budget

Defaults are in config.ts; validated environment overrides are in operations.md.

| Resource                    | Default / bound                                              |
| --------------------------- | ------------------------------------------------------------ |
| Continuous detailed markets | 5; configurable 0-50                                         |
| On-demand detailed markets  | 5; configurable 0-50, shared Java admission limit defaults 5 |
| Venues per market           | 3 maximum                                                    |
| Returned book depth         | 200 per side, configurable 20-200                            |
| Mutable book                | 4000 levels maximum; overflow invalidates and resynchronizes |
| Catalogue                   | 10000 instruments per venue maximum                          |
| Delta buffer / frame        | 256 / 1 MiB maximum                                          |
| Trades                      | most recent hour, at most 20000 per subscription             |
| On-demand warm TTL          | 5 minutes, configurable 1-60 minutes                         |
| Discovery / computation     | 5 minutes / 5 seconds                                        |
| Reconnect attempts          | 12/minute globally, jittered exponential backoff to 60s      |
| Persistence queue           | 100 pair snapshots, coalesced; minimum 10s interval          |
| Collector DB                | 2 connections, 3s connect / 5s statement timeout             |
| Container                   | 1 CPU, 384 MiB, 256 MiB JS heap, 80 pids, read-only/non-root |

## Tiered operation

Broad discovery downloads lightweight instruments/tickers, not full books. Top
qualifying liquid instruments are continuously observed. Opening another
qualifying instrument reserves on-demand capacity; wallet alerts keep their
markets warm. Last use expires after TTL. Rejected capacity returns a clear
unavailable response, not an unbounded subscription. The Java shared quota uses
an advisory lock so concurrent requests cannot overfill the watch set.

Minimum quote volume and depth are per quote currency. Unknown quote assets are
excluded until thresholds are explicitly configured. One venue alone is not
cross-venue confirmation. Private Binance research may explicitly use minimum
venues 1, producing at most LIMITED COVERAGE.

## Failure behavior

Any sequence gap, crossed book, malformed depth, queue overflow or stale feed
invalidates that venue. Generation fencing ignores delayed snapshots after
reconnect. Other instruments continue. Freshness uses actual book observations,
not the time JSON was served. Both frontend and backend expire data at 15 seconds.

DB outages cause bounded write failure/coalescing rather than unbounded promises.
Missing audit observations produce INCOMPLETE_DATA. Main application reads do not
wait on exchanges. Alert dispatch has bounded batches, transaction/statement/lock
timeouts, per-rule cooldown and existing outbox retry/dead-letter behavior.

## Observability

Protected /internal/health reports active instruments/subscriptions, venue health,
connection count, reconnects, resyncs, gaps, stale books, malformed frames, received
frame count, rate limits, detected zones, unreliable-wall observations, calculation
and request timings and persistence errors. Counters are process-local and reset
on restart. Received frames include protocol acknowledgements; unreliable-wall
counts are observations, not unique accused orders. No trader attribution is made.

Start one collector only. Raise budgets only after measuring the actual host.
The synthetic baseline excludes TLS, DB traffic and concurrent application load.
