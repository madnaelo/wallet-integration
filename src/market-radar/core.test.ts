import { describe, expect, it } from "vitest";
import { ReconstructedBook } from "./book";
import {
  binanceSnapshot,
  discoverInstruments,
  normalizeMessage,
  subscription,
} from "./adapters";
import { DEFAULT_RADAR_CONFIG, radarConfig } from "./config";
import { StructuralEngine } from "./engine";
import { calculateOutcome } from "./audit";
import { commercialRadarEnabled, permittedVenues } from "./policy";
import type { OrderBookSnapshot, PredictionAudit } from "./types";
import { fixtureInstrument, fixtureState } from "./fixtures";

const snap: OrderBookSnapshot = {
  kind: "snapshot",
  sequence: 10,
  observedAt: 1000000,
  bids: [
    ["99", "2"],
    ["98", "1"],
    ["97", "1"],
  ],
  asks: [
    ["101", "2"],
    ["102", "1"],
    ["103", "1"],
  ],
};

it("private internal enablement never grants commercial rights", () => {
  expect(
    commercialRadarEnabled({
      MARKET_RADAR_INTERNAL_ENABLED: "true",
      MARKET_RADAR_LIVE_ENABLED: "true",
    }),
  ).toBe(false);
  expect(permittedVenues("research", ["binance", "bybit", "okx"])).toEqual([
    "binance",
  ]);
  expect(permittedVenues("commercial", ["binance", "bybit", "okx"])).toEqual(
    [],
  );
});

describe("order book integrity", () => {
  it("reconstructs Binance absolute quantities and deletions", () => {
    const b = new ReconstructedBook("binance");
    b.apply(snap);
    b.apply({
      kind: "delta",
      sequence: 12,
      firstSequence: 11,
      observedAt: 1000100,
      bids: [
        ["99", "0"],
        ["98.5", "3"],
      ],
      asks: [],
    });
    expect(b.view().bids[0]).toEqual(["98.5", "3"]);
    expect(b.sequence).toBe(12);
  });
  it("discards old buffered Binance updates", () => {
    const b = new ReconstructedBook("binance");
    b.apply(snap);
    expect(
      b.apply({
        kind: "delta",
        sequence: 10,
        firstSequence: 8,
        observedAt: 1000100,
        bids: [],
        asks: [],
      }),
    ).toBe("DUPLICATE");
  });
  it("invalidates on a Binance gap and requires fresh snapshot", () => {
    const b = new ReconstructedBook("binance");
    b.apply(snap);
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 15,
        firstSequence: 14,
        observedAt: 1000100,
        bids: [],
        asks: [],
      }),
    ).toThrow("gap");
    expect(b.synchronized).toBe(false);
    expect(b.view().bids).toEqual([]);
    b.apply(snap);
    expect(b.synchronized).toBe(true);
  });
  it("accepts overlapping Binance updates spanning snapshot sequence", () => {
    const b = new ReconstructedBook("binance");
    b.apply(snap);
    b.apply({
      kind: "delta",
      sequence: 13,
      firstSequence: 9,
      observedAt: 1000100,
      bids: [],
      asks: [],
    });
    expect(b.sequence).toBe(13);
  });
  it("requires snapshot before delta", () => {
    const b = new ReconstructedBook("okx");
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 11,
        previousSequence: 10,
        observedAt: 1000100,
        bids: [],
        asks: [],
      }),
    ).toThrow("snapshot");
  });
  it("handles OKX matching prevSeqId, keepalive and sequence reset", () => {
    const b = new ReconstructedBook("okx");
    b.apply(snap);
    b.apply({
      kind: "delta",
      sequence: 10,
      previousSequence: 10,
      observedAt: 1000100,
      bids: [],
      asks: [],
    });
    b.apply({
      kind: "delta",
      sequence: 1,
      previousSequence: 10,
      observedAt: 1000200,
      bids: [["99", "3"]],
      asks: [],
    });
    expect(b.sequence).toBe(1);
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 3,
        previousSequence: 2,
        observedAt: 1000300,
        bids: [],
        asks: [],
      }),
    ).toThrow("gap");
  });
  it("does not invent consecutive Bybit IDs, but rejects backward updates", () => {
    const b = new ReconstructedBook("bybit");
    b.apply(snap);
    b.apply({
      kind: "delta",
      sequence: 14,
      crossSequence: 100,
      observedAt: 1000100,
      bids: [],
      asks: [],
    });
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 13,
        crossSequence: 99,
        observedAt: 1000200,
        bids: [],
        asks: [],
      }),
    ).toThrow();
    expect(b.synchronized).toBe(false);
  });
  it.each([
    { bids: [["bad", "1"]] },
    { bids: [["99", "-1"]] },
    { bids: [["999", "1"]] },
  ])("rejects malformed/crossed data atomically: %j", ({ bids }) => {
    const b = new ReconstructedBook("bybit");
    b.apply(snap);
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 11,
        crossSequence: 1,
        observedAt: 1000100,
        bids: bids as [string, string][],
        asks: [],
      }),
    ).toThrow();
    expect(b.view().bids).toEqual([]);
  });
  it("resyncs instead of truncating a full mutable book", () => {
    const b = new ReconstructedBook("bybit", 3);
    b.apply(snap);
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 11,
        crossSequence: 1,
        observedAt: 1000100,
        bids: [["98.5", "1"]],
        asks: [],
      }),
    ).toThrow("bound");
  });
  it("resyncs when initial Binance snapshot range is exhausted", () => {
    const b = new ReconstructedBook("binance");
    b.apply(snap);
    expect(() =>
      b.apply({
        kind: "delta",
        sequence: 11,
        firstSequence: 11,
        observedAt: 1000100,
        bids: [
          ["99", "0"],
          ["98", "0"],
        ],
        asks: [],
      }),
    ).toThrow("boundary");
  });
});

describe("venue normalization", () => {
  it("discovers an arbitrary Binance spot market, without a coin allowlist", () => {
    const result = discoverInstruments(
      "binance",
      {
        symbols: [
          {
            symbol: "TESTUSDT",
            status: "TRADING",
            baseAsset: "TEST",
            quoteAsset: "USDT",
            filters: [{ filterType: "PRICE_FILTER", tickSize: "0.01" }],
          },
        ],
      },
      [
        {
          symbol: "TESTUSDT",
          quoteVolume: "10000000",
          bidPrice: "99",
          askPrice: "100",
        },
      ],
      1000000,
    );
    expect(result[0].baseAsset).toBe("TEST");
    expect(result[0].quoteVolume24h).toBe(1e7);
  });
  it("uses quote turnover, not base volume, for Bybit", () => {
    const result = discoverInstruments(
      "bybit",
      {
        retCode: 0,
        result: {
          list: [
            {
              symbol: "TESTUSDT",
              status: "Trading",
              baseCoin: "TEST",
              quoteCoin: "USDT",
              priceFilter: { tickSize: "0.01" },
            },
          ],
        },
      },
      {
        retCode: 0,
        result: {
          list: [
            {
              symbol: "TESTUSDT",
              turnover24h: "8000000",
              volume24h: "10",
              bid1Price: "99",
              ask1Price: "100",
            },
          ],
        },
      },
      1000000,
    );
    expect(result[0].quoteVolume24h).toBe(8e6);
  });
  it("normalizes OKX spot instruments and rejects unavailable discovery", () => {
    const result = discoverInstruments(
      "okx",
      {
        code: "0",
        data: [
          {
            instId: "TEST-USDT",
            state: "live",
            baseCcy: "TEST",
            quoteCcy: "USDT",
            tickSz: "0.01",
          },
        ],
      },
      {
        code: "0",
        data: [
          {
            instId: "TEST-USDT",
            volCcy24h: "10000000",
            bidPx: "99",
            askPx: "100",
          },
        ],
      },
      1000000,
    );
    expect(result[0].symbol).toBe("TEST-USDT");
    expect(() =>
      discoverInstruments(
        "okx",
        { code: "500" },
        { code: "0", data: [] },
        1000000,
      ),
    ).toThrow();
  });
  it("correctly classifies Binance buyer-maker as aggressive selling", () => {
    const m = normalizeMessage(
      "binance",
      {
        e: "aggTrade",
        s: "TESTUSDT",
        a: 1,
        T: 1000000,
        p: "100",
        q: "2",
        m: true,
      },
      fixtureInstrument(),
    );
    expect(m[0].trades?.[0].aggressor).toBe("SELL");
  });
  it("checks symbol before consuming a venue message", () => {
    expect(() =>
      normalizeMessage(
        "binance",
        { e: "depthUpdate", s: "OTHERUSDT" },
        fixtureInstrument(),
      ),
    ).toThrow("instrument");
  });
  it("normalizes Bybit service reset to a new snapshot", () => {
    const m = normalizeMessage(
      "bybit",
      {
        topic: "orderbook.200.TESTUSDT",
        type: "delta",
        ts: 1000000,
        data: {
          s: "TESTUSDT",
          u: 1,
          seq: 200,
          b: [["99", "1"]],
          a: [["101", "1"]],
        },
      },
      fixtureInstrument("bybit"),
    );
    expect(m[0].book?.kind).toBe("snapshot");
  });
  it("uses OKX prevSeqId, not deprecated checksum", () => {
    const m = normalizeMessage(
      "okx",
      {
        arg: { channel: "books", instId: "TESTUSDT" },
        action: "update",
        data: [
          {
            seqId: 12,
            prevSeqId: 10,
            ts: "1000000",
            bids: [],
            asks: [],
            checksum: 0,
          },
        ],
      },
      fixtureInstrument("okx"),
    );
    expect(m[0].book).toMatchObject({ previousSequence: 10, sequence: 12 });
  });
  it("rejects unsafe IDs and limits subscriptions to books/trades", () => {
    expect(() =>
      binanceSnapshot(
        { lastUpdateId: Number.MAX_SAFE_INTEGER + 1, bids: [], asks: [] },
        1000000,
      ),
    ).toThrow();
    expect(
      JSON.stringify(subscription("bybit", fixtureInstrument("bybit"))),
    ).not.toMatch(/order\.create|private|position/);
  });
});

function warmedEngine() {
  const engine = new StructuralEngine(fixtureInstrument());
  let snapshot = engine.calculate(
    [fixtureState("binance", 1000000), fixtureState("okx", 1000000)],
    1000000,
  );
  for (let at = 1005000; at <= 4600000; at += 5000)
    snapshot = engine.calculate(
      [fixtureState("binance", at), fixtureState("okx", at)],
      at,
    );
  return { engine, snapshot };
}
describe("structural calculations", () => {
  it("does not fabricate zones for insufficient or stale data", () => {
    const e = new StructuralEngine(fixtureInstrument());
    expect(e.calculate([], 1000000).supplyZones).toEqual([]);
    const old = fixtureState("binance", 1000000);
    expect(e.calculate([old], 2000000).freshness).toBe("STALE");
  });
  it("waits for history and respects configured quote-currency thresholds", () => {
    const e = new StructuralEngine(fixtureInstrument());
    expect(
      e.calculate(
        [fixtureState("binance", 1000000), fixtureState("okx", 1000000)],
        1000000,
      ).coverage,
    ).toBe("INSUFFICIENT_DATA");
    const unusual = new StructuralEngine({
      ...fixtureInstrument(),
      quoteAsset: "UNKNOWN",
    });
    expect(unusual.calculate([], 1000000).coverage).toBe("INSUFFICIENT_DATA");
  });
  it("detects ranges with persistent cross-venue walls, not an exact price/probability", () => {
    const { snapshot } = warmedEngine();
    expect(snapshot.supplyZones.length).toBeGreaterThan(0);
    expect(snapshot.demandZones.length).toBeGreaterThan(0);
    const zone = snapshot.supplyZones[0];
    expect(zone.lower).toBeGreaterThan(snapshot.referencePrice!);
    expect(zone.upper).toBeGreaterThan(zone.lower);
    expect(zone.persistenceMs).toBe(3600000);
    expect(zone.venues).toHaveLength(2);
    expect(zone.strength).toBeGreaterThan(40);
    expect(snapshot.scoreMeaning).toBe("STRUCTURAL_CONFLUENCE_NOT_PROBABILITY");
  });
  it("discounts a new wall and single-venue disagreement", () => {
    const { snapshot } = warmedEngine();
    const engine = new StructuralEngine(fixtureInstrument());
    const at = 4600000;
    const fresh = engine.calculate(
      [fixtureState("binance", at), fixtureState("okx", at, 10)],
      at,
    );
    expect(fresh.supplyZones[0].strength).toBeLessThan(
      snapshot.supplyZones[0].strength,
    );
    expect(fresh.supplyZones[0].venues).toHaveLength(1);
  });
  it("recognizes executed buying with replenished asks", () => {
    const { engine, snapshot } = warmedEngine();
    const states = [
      fixtureState("binance", 4605000),
      fixtureState("okx", 4605000),
    ];
    for (const state of states)
      state.trades = [
        {
          id: "fill",
          observedAt: 4604000,
          price:
            (snapshot.supplyZones[0].lower + snapshot.supplyZones[0].upper) / 2,
          quantity: 5000,
          aggressor: "BUY",
        },
      ];
    const result = engine.calculate(states, 4605000);
    expect(result.supplyZones[0].absorption).toBe("REPLENISHING");
    expect(result.cvd.delta).toBeGreaterThan(0);
  });
  it("marks disappearing zones as weakening rather than reusing old active numbers", () => {
    const { engine } = warmedEngine();
    const result = engine.calculate(
      [fixtureState("binance", 4605000, 10), fixtureState("okx", 4605000, 10)],
      4605000,
    );
    expect(result.supplyZones).toEqual([]);
    expect(result.previousZones.some((z) => z.lifecycle === "WEAKENING")).toBe(
      true,
    );
  });
  it("excludes wildly divergent venue prices and duplicate venues", () => {
    const state = fixtureState("binance", 1200000);
    const e = new StructuralEngine(fixtureInstrument());
    expect(e.calculate([state, state], 1200000).coverage).toBe(
      "INSUFFICIENT_DATA",
    );
  });
  it("refuses time travel in scoring", () => {
    const e = new StructuralEngine(fixtureInstrument());
    e.calculate([], 1000000);
    expect(() => e.calculate([], 999999)).toThrow("advance");
  });
});

describe("audits and policy", () => {
  it("calculates contact, break, weakening and excursion from observed prices", () => {
    const { snapshot } = warmedEngine();
    const zone = { ...snapshot.supplyZones[0], lower: 102, upper: 103 };
    const audit: PredictionAudit = {
      id: "test",
      snapshot: { ...snapshot, observedAt: 1000000, referencePrice: 100 },
      zone,
      horizonMs: 40000,
      scoringVersion: snapshot.scoringVersion,
    };
    const outcome = calculateOutcome(
      audit,
      [
        { at: 1000000, price: 100 },
        { at: 1010000, price: 102 },
        { at: 1020000, price: 101, zoneLifecycle: "WEAKENING" },
        { at: 1030000, price: 104 },
        { at: 1040000, price: 99 },
        { at: 1050000, price: 99 },
      ],
      1050000,
    );
    expect(outcome.status).toBe("COMPLETE");
    expect(outcome.firstContactAt).toBe(1010000);
    expect(outcome.weakenedBeforeBreak).toBe(true);
    expect(outcome.maxReversalAfterContactBps).toBeGreaterThan(200);
  });
  it("does not claim outcomes across missing observation intervals", () => {
    const { snapshot } = warmedEngine();
    const a: PredictionAudit = {
      id: "test",
      snapshot,
      zone: snapshot.supplyZones[0],
      horizonMs: 3600000,
      scoringVersion: snapshot.scoringVersion,
    };
    expect(calculateOutcome(a, [], snapshot.observedAt + 3600000).status).toBe(
      "INCOMPLETE_DATA",
    );
    expect(calculateOutcome(a, [], snapshot.observedAt + 1).status).toBe(
      "PENDING",
    );
  });
  it("a runtime flag cannot approve a data license", () => {
    expect(commercialRadarEnabled({ MARKET_RADAR_LIVE_ENABLED: "true" })).toBe(
      false,
    );
    expect(permittedVenues("commercial", ["binance", "bybit", "okx"])).toEqual(
      [],
    );
  });
  it("rejects runaway resource configurations", () => {
    expect(() => radarConfig({ RADAR_CONTINUOUS_MARKETS: "5000" })).toThrow();
    expect(() => radarConfig({ RADAR_MIN_DEPTHS: '{"USDT":0}' })).toThrow();
    expect(radarConfig({})).toEqual(DEFAULT_RADAR_CONFIG);
  });
});
