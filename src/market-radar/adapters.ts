import type {
  MarketInstrument,
  OrderBookDelta,
  OrderBookSnapshot,
  PriceLevel,
  Trade,
  Venue,
} from "./types";
import { validAsset } from "./types";

type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected feed object");
  return value as Obj;
}
function list(value: unknown, max = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new Error("Invalid feed collection");
  return value;
}
function positive(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0)
    throw new Error("Invalid feed number");
  return result;
}
function nonnegative(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0)
    throw new Error("Invalid feed number");
  return result;
}
function id(value: unknown): number {
  const result = nonnegative(value);
  if (!Number.isSafeInteger(result)) throw new Error("Unsafe update ID");
  return result;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128)
    throw new Error("Invalid feed identifier");
  return value;
}
function levels(value: unknown): PriceLevel[] {
  return list(value, 4000).map((v) => {
    const row = list(v, 8);
    return [text(row[0]), text(row[1])];
  });
}

export const ENDPOINTS = {
  binance: {
    rest: "https://api.binance.com",
    websocket: "wss://stream.binance.com:9443/ws",
  },
  bybit: {
    rest: "https://api.bybit.com",
    websocket: "wss://stream.bybit.com/v5/public/spot",
  },
  okx: {
    rest: "https://www.okx.com",
    websocket: "wss://ws.okx.com:8443/ws/v5/public",
  },
} as const;

export function discoveryPaths(venue: Venue): string[] {
  if (venue === "binance")
    return [
      "/api/v3/exchangeInfo?permissions=SPOT&showPermissionSets=false&symbolStatus=TRADING",
      "/api/v3/ticker/24hr",
    ];
  if (venue === "bybit")
    return [
      "/v5/market/instruments-info?category=spot",
      "/v5/market/tickers?category=spot",
    ];
  return [
    "/api/v5/public/instruments?instType=SPOT",
    "/api/v5/market/tickers?instType=SPOT",
  ];
}

export function discoverInstruments(
  venue: Venue,
  instruments: unknown,
  tickers: unknown,
  now: number,
): MarketInstrument[] {
  const info = object(instruments);
  const prices = objectOrArray(tickers);
  if (
    venue === "bybit" &&
    (info.retCode !== 0 || object(tickers).retCode !== 0)
  )
    throw new Error("Venue discovery unavailable");
  if (venue === "okx" && (info.code !== "0" || object(tickers).code !== "0"))
    throw new Error("Venue discovery unavailable");
  const entries = list(
    venue === "binance"
      ? info.symbols
      : venue === "bybit"
        ? object(info.result).list
        : info.data,
  );
  const ticks = list(
    venue === "binance"
      ? prices
      : venue === "bybit"
        ? object(object(tickers).result).list
        : object(tickers).data,
  );
  const indexed = new Map(
    ticks.map((t) => {
      const row = object(t);
      return [String(venue === "okx" ? row.instId : row.symbol), row];
    }),
  );
  const result: MarketInstrument[] = [];
  for (const raw of entries) {
    try {
      const row = object(raw);
      if (
        String(venue === "okx" ? row.state : row.status) !==
        (venue === "binance"
          ? "TRADING"
          : venue === "bybit"
            ? "Trading"
            : "live")
      )
        continue;
      const symbol = text(venue === "okx" ? row.instId : row.symbol);
      const baseAsset =
        venue === "binance"
          ? row.baseAsset
          : venue === "bybit"
            ? row.baseCoin
            : row.baseCcy;
      const quoteAsset =
        venue === "binance"
          ? row.quoteAsset
          : venue === "bybit"
            ? row.quoteCoin
            : row.quoteCcy;
      if (
        !validAsset(baseAsset) ||
        !validAsset(quoteAsset) ||
        !/^[A-Z0-9._-]{1,80}$/.test(symbol)
      )
        continue;
      const ticker = indexed.get(symbol);
      if (!ticker) continue;
      const filter =
        venue === "binance"
          ? list(row.filters)
              .map(object)
              .find((f) => f.filterType === "PRICE_FILTER")
          : null;
      result.push({
        venue,
        symbol,
        baseAsset,
        quoteAsset,
        marketType: "SPOT",
        discoveredAt: now,
        priceTick: positive(
          venue === "binance"
            ? filter?.tickSize
            : venue === "bybit"
              ? object(row.priceFilter).tickSize
              : row.tickSz,
        ),
        quoteVolume24h: nonnegative(
          venue === "binance"
            ? ticker.quoteVolume
            : venue === "bybit"
              ? ticker.turnover24h
              : ticker.volCcy24h,
        ),
        bestBid: positive(
          venue === "binance"
            ? ticker.bidPrice
            : venue === "bybit"
              ? ticker.bid1Price
              : ticker.bidPx,
        ),
        bestAsk: positive(
          venue === "binance"
            ? ticker.askPrice
            : venue === "bybit"
              ? ticker.ask1Price
              : ticker.askPx,
        ),
      });
    } catch {
      /* Delisted/invalid instruments do not poison the full discovery response. */
    }
  }
  return result;
}
function objectOrArray(value: unknown) {
  return Array.isArray(value) ? value : object(value);
}

export function subscription(
  venue: Venue,
  instrument: MarketInstrument,
): object {
  if (venue === "binance")
    return {
      method: "SUBSCRIBE",
      params: [
        `${instrument.symbol.toLowerCase()}@depth@100ms`,
        `${instrument.symbol.toLowerCase()}@aggTrade`,
      ],
      id: 1,
    };
  if (venue === "bybit")
    return {
      op: "subscribe",
      args: [
        `orderbook.200.${instrument.symbol}`,
        `publicTrade.${instrument.symbol}`,
      ],
    };
  return {
    op: "subscribe",
    args: [
      { channel: "books", instId: instrument.symbol },
      { channel: "trades", instId: instrument.symbol },
    ],
  };
}

export interface NormalizedMessage {
  book?: OrderBookSnapshot | OrderBookDelta;
  trades?: Trade[];
  heartbeat?: boolean;
}
export function normalizeMessage(
  venue: Venue,
  input: unknown,
  instrument: MarketInstrument,
): NormalizedMessage[] {
  if (input === "pong") return [{ heartbeat: true }];
  const raw = object(input);
  if (venue === "binance") {
    if (raw.result === null) return [{ heartbeat: true }];
    if (raw.s !== instrument.symbol)
      throw new Error("Wrong instrument in feed");
    if (raw.e === "depthUpdate")
      return [
        {
          book: {
            kind: "delta",
            sequence: id(raw.u),
            firstSequence: id(raw.U),
            observedAt: id(raw.E),
            bids: levels(raw.b),
            asks: levels(raw.a),
          },
        },
      ];
    if (raw.e === "aggTrade") {
      if (typeof raw.m !== "boolean") throw new Error("Unknown taker side");
      return [
        {
          trades: [
            {
              id: String(id(raw.a)),
              observedAt: id(raw.T),
              price: positive(raw.p),
              quantity: positive(raw.q),
              aggressor: raw.m ? "SELL" : "BUY",
            },
          ],
        },
      ];
    }
  } else if (venue === "bybit") {
    if (raw.success === false) throw new Error("Venue rejected subscription");
    if (raw.op) return [{ heartbeat: true }];
    const topic = text(raw.topic);
    if (!topic.endsWith(`.${instrument.symbol}`))
      throw new Error("Wrong instrument in feed");
    if (topic.startsWith("orderbook.")) {
      const d = object(raw.data);
      if (d.s !== instrument.symbol)
        throw new Error("Wrong instrument in book");
      if (raw.type !== "snapshot" && raw.type !== "delta")
        throw new Error("Unknown book action");
      return [
        {
          book: {
            kind: raw.type === "snapshot" || d.u === 1 ? "snapshot" : "delta",
            sequence: id(d.u),
            crossSequence: id(d.seq),
            observedAt: id(raw.cts ?? raw.ts),
            bids: levels(d.b),
            asks: levels(d.a),
          },
        },
      ];
    }
    if (topic.startsWith("publicTrade."))
      return [
        {
          trades: list(raw.data, 2000).map((value) => {
            const d = object(value);
            if (
              d.s !== instrument.symbol ||
              !["Buy", "Sell"].includes(String(d.S))
            )
              throw new Error("Invalid trade");
            return {
              id: text(d.i),
              observedAt: id(d.T),
              price: positive(d.p),
              quantity: positive(d.v),
              aggressor: d.S === "Buy" ? "BUY" : "SELL",
            };
          }),
        },
      ];
  } else {
    if (raw.event === "error") throw new Error("Venue rejected subscription");
    if (raw.event) return [{ heartbeat: true }];
    const arg = object(raw.arg);
    if (arg.instId !== instrument.symbol)
      throw new Error("Wrong instrument in feed");
    if (arg.channel === "books")
      return list(raw.data, 10).map((value) => {
        const d = object(value);
        if (raw.action !== "snapshot" && raw.action !== "update")
          throw new Error("Unknown book action");
        return {
          book: {
            kind: raw.action === "snapshot" ? "snapshot" : "delta",
            sequence: id(d.seqId),
            previousSequence: Number(d.prevSeqId),
            observedAt: id(d.ts),
            bids: levels(d.bids),
            asks: levels(d.asks),
          },
        };
      });
    if (arg.channel === "trades")
      return [
        {
          trades: list(raw.data, 2000).map((value) => {
            const d = object(value);
            if (
              d.instId !== instrument.symbol ||
              !["buy", "sell"].includes(String(d.side))
            )
              throw new Error("Invalid trade");
            return {
              id: text(d.tradeId),
              observedAt: id(d.ts),
              price: positive(d.px),
              quantity: positive(d.sz),
              aggressor: d.side === "buy" ? "BUY" : "SELL",
            };
          }),
        },
      ];
  }
  throw new Error("Unexpected venue message");
}

export function binanceSnapshot(
  input: unknown,
  now: number,
): OrderBookSnapshot {
  const raw = object(input);
  return {
    kind: "snapshot",
    sequence: id(raw.lastUpdateId),
    observedAt: now,
    bids: levels(raw.bids),
    asks: levels(raw.asks),
  };
}
