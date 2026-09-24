# Market Radar Architecture

Market Radar is a read-only module of Swap Assistant, not a trading system.

## Boundaries

```text
Browser /market-radar -> existing same-origin backend proxy
  -> Spring MarketRadarController -> compact PostgreSQL market_radar schema
Separate Node collector -> fixed exchange REST/WebSocket endpoints
  -> normalized books/trades -> deterministic engine -> bounded persistence queue
  -> compact observations/signals/outcomes/events
Spring Radar dispatch -> existing wallet preferences -> existing notification outbox
/demo -> hand-authored synthetic fixtures + presentation only
```

The high-frequency process never imports swap, authentication, revenue or contact
services. It has its own heap, CPU/memory/container limits, two-connection database
pool and restricted database role. Its failure cannot throw into request handlers
or share the application's event loop. Shared PostgreSQL/host capacity remains a
shared dependency; limits reduce contention, not a claim of absolute isolation.

The existing Java application owns migration V32, authorized alert preferences,
bounded on-demand requests and outbox delivery. Ordinary clients receive compact
snapshots, never raw books. Research rows carry a separate audience and cannot be
returned by commercial endpoints. Rights are checked in both TS and Java code,
in addition to runtime flags. A runtime flag alone cannot authorize a venue.

## Why this size

Node with ws and pg matches existing TypeScript skills and enables protocol
fixture tests. Memory holds transient books/trades; PostgreSQL keeps bounded
derived history. No Kafka, Redis dependency, ClickHouse or cluster is needed.
One collector per deployment is the V1 operating model. Pair advisory locks,
idempotent signal IDs and leased audits prevent duplicate persistence, but there
is no distributed subscription coordinator; do not scale collectors horizontally
without extending that ownership mechanism.

## Entry points

- src/market-radar/main.ts: lifecycle/configuration.
- transport.ts, adapters.ts, book.ts: venue correctness.
- subscriptions.ts, collector.ts: coverage and resource allocation.
- engine.ts, audit.ts, events.ts: deterministic analysis.
- store.ts, persistence-queue.ts: durable bounded writes.
- backend/.../marketradar/: public reads, wallet rules, outbox bridge.
- src/components/market-radar/: shared presentation, isolated demo.

No exchange credentials, wallet access, signing, transaction submission or order
placement exists in the collector. Get Quote is a deliberate navigation into the
unchanged swap workflow; a market symbol is not guessed to be a token address.
