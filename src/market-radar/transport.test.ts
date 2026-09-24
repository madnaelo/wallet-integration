import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import { DEFAULT_RADAR_CONFIG } from "./config";
import {
  ConnectionBudget,
  RadarMetrics,
  VenueFeed,
  VenueRequestBudget,
  reconnectDelay,
} from "./transport";
import type { MarketInstrument, Venue } from "./types";
import { SubscriptionPlanner } from "./subscriptions";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function until(predicate: () => boolean) {
  const end = Date.now() + 3000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Fixture timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}
function instrument(
  venue: Venue = "binance",
  baseAsset = "TEST",
): MarketInstrument {
  return {
    venue,
    baseAsset,
    quoteAsset: "USDT",
    marketType: "SPOT",
    symbol: `${baseAsset}USDT`,
    priceTick: 0.01,
    quoteVolume24h: 1e8,
    bestBid: 99.99,
    bestAsk: 100.01,
    discoveredAt: Date.now(),
  };
}
async function fixture(
  venue: Venue = "binance",
  snapshot: () => Promise<unknown> = async () => ({
    lastUpdateId: 10,
    bids: [
      ["99", "2"],
      ["98", "2"],
      ["97", "1"],
    ],
    asks: [
      ["101", "2"],
      ["102", "2"],
      ["103", "1"],
    ],
  }),
) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", r));
  const sockets: WebSocket[] = [];
  const subscriptions: unknown[] = [];
  server.on("connection", (socket) => {
    sockets.push(socket);
    socket.on("message", (bytes) =>
      subscriptions.push(JSON.parse(bytes.toString())),
    );
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const feed = new VenueFeed(
    instrument(venue),
    { ...DEFAULT_RADAR_CONFIG, maxBufferedDeltas: 2 },
    { connect: () => new WebSocket(url), snapshot },
    new ConnectionBudget(20),
    new RadarMetrics(),
  );
  cleanups.push(async () => {
    feed.stop();
    for (const socket of sockets) socket.terminate();
    await new Promise<void>((r) => server.close(() => r()));
  });
  feed.start();
  await until(() => subscriptions.length > 0);
  const send = (value: unknown) =>
    sockets[sockets.length - 1].send(JSON.stringify(value));
  const delta = (first = 11, last = 11) => ({
    e: "depthUpdate",
    s: "TESTUSDT",
    U: first,
    u: last,
    E: Date.now(),
    b: [["99", "4"]],
    a: [],
  });
  return { feed, sockets, subscriptions, send, delta };
}

describe("real local WebSocket exchange fixtures", () => {
  it("buffers updates during REST snapshot and reconstructs the latest book", async () => {
    let resolve!: (value: unknown) => void;
    const f = await fixture(
      "binance",
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    f.send(f.delta());
    await until(() => f.feed.metrics.updates === 1);
    expect(f.feed.state().healthy).toBe(false);
    resolve({
      lastUpdateId: 10,
      bids: [
        ["99", "2"],
        ["98", "1"],
      ],
      asks: [
        ["101", "2"],
        ["102", "1"],
      ],
    });
    await until(() => f.feed.state().healthy);
    expect(f.feed.state().bids[0]).toEqual(["99", "4"]);
  });
  it("discards a gapped book and reconnects with a new snapshot", async () => {
    const f = await fixture();
    await until(() => f.feed.state().healthy);
    f.send(f.delta(13, 14));
    await until(() => f.feed.metrics.sequenceGaps === 1);
    expect(f.feed.state().healthy).toBe(false);
    expect(f.feed.state().bids).toEqual([]);
    f.feed.tick(Date.now() + 61000);
    await until(() => f.sockets.length === 2 && f.feed.state().healthy);
    expect(f.feed.book.sequence).toBe(10);
  });
  it("handles OKX snapshots, gaps and stale streams", async () => {
    const f = await fixture("okx");
    f.send({
      arg: { channel: "books", instId: "TESTUSDT" },
      action: "snapshot",
      data: [
        {
          seqId: 10,
          prevSeqId: -1,
          ts: String(Date.now()),
          bids: [["99", "2"]],
          asks: [["101", "2"]],
        },
      ],
    });
    await until(() => f.feed.state().healthy);
    f.feed.tick(Date.now() + 16000);
    expect(f.feed.state().healthy).toBe(false);
    expect(f.feed.metrics.staleBooks).toBe(1);
  });
  it("normalizes a Bybit reset and never treats nonconsecutive IDs as a proven gap", async () => {
    const f = await fixture("bybit");
    const message = (u: number, seq: number, type = "delta") => ({
      topic: "orderbook.200.TESTUSDT",
      type,
      ts: Date.now(),
      data: { s: "TESTUSDT", u, seq, b: [["99", "3"]], a: [["101", "3"]] },
    });
    f.send(message(100, 200, "snapshot"));
    await until(() => f.feed.state().healthy);
    f.send(message(120, 220));
    await until(() => f.feed.book.sequence === 120);
    f.send(message(1, 1));
    await until(() => f.feed.book.sequence === 1);
    expect(f.feed.state().continuity).toBe("TRANSPORT_ONLY");
  });
  it("invalidates malformed frames without poisoning another feed", async () => {
    const broken = await fixture();
    const good = await fixture();
    await until(() => broken.feed.state().healthy && good.feed.state().healthy);
    broken.sockets[0].send("not-json");
    await until(() => broken.feed.metrics.malformedFrames === 1);
    expect(broken.feed.state().healthy).toBe(false);
    expect(good.feed.state().healthy).toBe(true);
  });
  it("bounds pending snapshot deltas", async () => {
    const f = await fixture("binance", () => new Promise(() => undefined));
    f.send(f.delta());
    f.send(f.delta(12, 12));
    f.send(f.delta(13, 13));
    await until(() => f.feed.metrics.resyncs > 0);
    expect(f.feed.state().healthy).toBe(false);
  });
});

describe("resource and request budgets", () => {
  it("rejects REST requests during a server-specified cooldown without sleeping indefinitely", async () => {
    let requests = 0;
    const budget = new VenueRequestBudget(async () => {
      requests++;
      return new Response("", {
        status: 429,
        headers: { "retry-after": "3600" },
      });
    }, 0);
    await expect(
      budget.get("https://example.invalid", "/ticker"),
    ).rejects.toThrow("rate limit");
    await expect(
      budget.get("https://example.invalid", "/ticker"),
    ).rejects.toThrow("cooldown");
    expect(requests).toBe(1);
  });
  it("caps reconnection rate and exponential delay", () => {
    const budget = new ConnectionBudget(2);
    expect(budget.reserve(100)).toBe(true);
    expect(budget.reserve(200)).toBe(true);
    expect(budget.reserve(300)).toBe(false);
    expect(budget.reserve(60101)).toBe(true);
    expect(reconnectDelay(50, 60000, () => 1)).toBe(60000);
    expect(reconnectDelay(0, 60000, () => 0)).toBe(750);
  });
  it("expires on-demand subscriptions and never exceeds configured caps", () => {
    const planner = new SubscriptionPlanner({
      ...DEFAULT_RADAR_CONFIG,
      continuousMarkets: 1,
      onDemandMarkets: 1,
      minimumVenues: 1,
      venuesPerMarket: 1,
    });
    const now = Date.now();
    const catalog = [
      instrument("binance", "AAA"),
      instrument("binance", "BBB"),
      instrument("binance", "CCC"),
    ];
    expect(planner.plan(catalog, now)).toHaveLength(1);
    expect(planner.watch("BBB/USDT/SPOT", catalog, now)).toBe(true);
    expect(planner.watch("CCC/USDT/SPOT", catalog, now)).toBe(false);
    expect(planner.plan(catalog, now)).toHaveLength(2);
    expect(planner.plan(catalog, now + 300001)).toHaveLength(1);
  });
});
