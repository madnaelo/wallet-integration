# Exchange Connectors

Official documentation reviewed 2026-09-24; technical implementation does not
override the separate data-rights gate.

| Venue        | Discovery                                 | Depth / trades                             | Integrity                                                                              |
| ------------ | ----------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| Binance spot | exchangeInfo SPOT/TRADING plus 24h ticker | diff depth + aggTrade; REST depth snapshot | buffer before snapshot, discard old updates, require U <= last+1 <= u, gap invalidates |
| Bybit spot   | instruments-info + tickers                | orderbook.200 + publicTrade                | snapshot/delta, u=1 reset, monotonic u/seq; no invented consecutive-ID guarantee       |
| OKX spot     | public/instruments + market/tickers       | books + trades                             | snapshot then exact prevSeqId linkage, documented sequence reset/keepalive             |

Binance initial REST range is a trust boundary. Updates beyond it are not treated
as complete depth; reaching its edge triggers resynchronization. All venues reject
malformed/crossed/empty books atomically. IDs must be safe integers. A bounded
mutable book never silently truncates while claiming integrity.

Bybit continuity is explicitly TRANSPORT_ONLY and discounted. Its IDs do not
prove every server delta was published; ordered TCP, snapshot resets and periodic
five-minute resynchronization provide the practical boundary.

OKX deprecated book checksums for production on 23 June 2026. The implementation
uses seqId/prevSeqId, not a fake checksum success on the now-zero field.
[Official checksum notice](https://www.okx.com/en-au/help/okx-order-book-channels-checksum-field-deprecation).

Reconnect uses exponential jitter and a global attempts budget. Native Binance
ping/pong is handled by ws; Bybit/OKX application heartbeat runs every ten seconds.
Freshness independently expires after 15 seconds. REST requests are serialized
per venue, time-limited, payload-bounded and respect 429/418 Retry-After cooldowns.
One book/trade socket per detailed instrument is intentionally bounded, not
maximum-depth subscriptions for the entire catalogue.

## Sources and limits

- [Binance stream specification](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md):
  server disconnect after 24h, 5 incoming control messages/s, 1024 streams/connection,
  300 connection attempts/5min/IP. Reconnect/staleness handles disconnection.
- [Binance REST specification](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md):
  endpoint-weighted limits; exchangeInfo filters reduce discovery payload.
- [Bybit books](https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook),
  [connection limits](https://bybit-exchange.github.io/docs/v5/ws/connect),
  [rate limits](https://bybit-exchange.github.io/docs/v5/rate-limit):
  spot depth200 supported; one bounded subscription message per connection.
- [OKX API specification](https://www.okx.com/docs-v5/en/):
  endpoint-specific REST limits, 3 connection requests/s/IP and 480
  subscribe/unsubscribe/login requests/hour/connection.

Recheck limits and regional endpoints before licensed activation; V1 is far below
documented control-message limits but other applications can share an IP quota.
Live validation was Binance only. Bybit/OKX use deterministic local fixtures
because their live use has not been authorized for this product.
