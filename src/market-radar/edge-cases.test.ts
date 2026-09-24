import { describe, expect, it } from "vitest";
import { StructuralEngine } from "./engine";
import { fixtureInstrument, fixtureState } from "./fixtures";
import { DEFAULT_RADAR_CONFIG } from "./config";
import { calculateOutcome } from "./audit";
import { detectEvents } from "./events";
import { PersistenceQueue } from "./persistence-queue";
import { syntheticRadar } from "../lib/marketRadarDemo";
import type { PredictionAudit } from "./types";

function warm() {
  const e = new StructuralEngine(fixtureInstrument());
  e.calculate(
    [fixtureState("binance", 1000000), fixtureState("okx", 1000000)],
    1000000,
  );
  let snapshot;
  for (let at = 1005000; at <= 1130000; at += 5000)
    snapshot = e.calculate(
      [fixtureState("binance", at), fixtureState("okx", at)],
      at,
    );
  return { e, snapshot: snapshot! };
}
describe("structural edge cases", () => {
  it("excludes a third venue whose prices disagree with the healthy majority", () => {
    const states = [
      fixtureState("binance", 1200000),
      fixtureState("bybit", 1200000),
      fixtureState("okx", 1200000),
    ];
    states[2].bids = states[2].bids.map(([p, q]) => [String(Number(p) * 2), q]);
    states[2].asks = states[2].asks.map(([p, q]) => [String(Number(p) * 2), q]);
    const next = new StructuralEngine(fixtureInstrument()).calculate(
      states,
      1200000,
    );
    expect(next.referencePrice).toBe(100);
    expect(next.venues.find((v) => v.venue === "okx")?.healthy).toBe(false);
    expect(next.supplyZones[0].venues).toHaveLength(2);
  });
  it("weights consensus by liquidity rather than counting venues equally", () => {
    const states = [
      fixtureState("binance", 1200000),
      fixtureState("bybit", 1200000, 10),
      fixtureState("okx", 1200000),
    ];
    states[1].instrument.quoteVolume24h = 1e10;
    const next = new StructuralEngine(fixtureInstrument()).calculate(
      states,
      1200000,
    );
    const consensus = next.supplyZones[0].evidence.find(
      (e) => e.key === "consensus",
    )!;
    expect(next.supplyZones[0].venues).toHaveLength(2);
    expect(consensus.value).toBeLessThan(0.2);
  });
  it("does not lose arithmetic integrity when a disappeared wall reappears", () => {
    const { e } = warm();
    const gone = [
      fixtureState("binance", 1135000),
      fixtureState("okx", 1135000),
    ];
    for (const state of gone)
      state.asks = state.asks.filter((_, i) => i < 90 || i > 99);
    e.calculate(gone, 1135000);
    const next = e.calculate(
      [fixtureState("binance", 1140000), fixtureState("okx", 1140000)],
      1140000,
    );
    expect(
      next.supplyZones.every(
        (z) => Number.isFinite(z.strength) && z.persistenceMs === 0,
      ),
    ).toBe(true);
  });
  it("scales bands by percentage for very differently priced assets", () => {
    for (const scale of [0.001, 1000]) {
      const states = [
        fixtureState("binance", 1200000),
        fixtureState("okx", 1200000),
      ];
      for (const state of states) {
        state.bids = state.bids.map(([p, q]) => [
          String(Number(p) * scale),
          String(Number(q) / scale),
        ]);
        state.asks = state.asks.map(([p, q]) => [
          String(Number(p) * scale),
          String(Number(q) / scale),
        ]);
      }
      const next = new StructuralEngine(fixtureInstrument()).calculate(
        states,
        1200000,
      );
      expect(next.supplyZones.length).toBeGreaterThan(0);
      expect(next.supplyZones[0].lower / next.referencePrice!).toBeGreaterThan(
        1.01,
      );
      expect(next.supplyZones[0].upper / next.referencePrice!).toBeLessThan(
        1.04,
      );
    }
  });
  it("resets persistence after a wall falls below concentration thresholds", () => {
    const { e } = warm();
    e.calculate(
      [fixtureState("binance", 1135000, 10), fixtureState("okx", 1135000, 10)],
      1135000,
    );
    const next = e.calculate(
      [fixtureState("binance", 1140000), fixtureState("okx", 1140000)],
      1140000,
    );
    expect(next.supplyZones[0].persistenceMs).toBe(0);
    expect(next.supplyZones[0].wallReliability).toBeLessThan(100);
  });
  it("classifies aggressive selling into replenished bids symmetrically", () => {
    const { e, snapshot } = warm();
    const states = [
      fixtureState("binance", 1135000),
      fixtureState("okx", 1135000),
    ];
    for (const state of states)
      state.trades = [
        {
          id: "sell",
          observedAt: 1134000,
          price:
            (snapshot.demandZones[0].lower + snapshot.demandZones[0].upper) / 2,
          quantity: 10000,
          aggressor: "SELL",
        },
      ];
    const next = e.calculate(states, 1135000);
    expect(next.demandZones[0].absorption).toBe("REPLENISHING");
    expect(next.cvd.delta).toBeLessThan(0);
  });
  it("distinguishes consumed supply from replenishment", () => {
    const { e, snapshot } = warm();
    const states = [
      fixtureState("binance", 1135000, 100),
      fixtureState("okx", 1135000, 100),
    ];
    for (const state of states)
      state.trades = [
        {
          id: "buy",
          observedAt: 1134000,
          price:
            (snapshot.supplyZones[0].lower + snapshot.supplyZones[0].upper) / 2,
          quantity: 10000,
          aggressor: "BUY",
        },
      ];
    const next = e.calculate(states, 1135000);
    expect(next.supplyZones[0].absorption).toBe("BEING_CONSUMED");
    expect(next.supplyZones[0].lifecycle).toBe("WEAKENING");
  });
  it("rejects shallow books despite healthy transport and high turnover", () => {
    const states = [
      fixtureState("binance", 1135000, 0.001),
      fixtureState("okx", 1135000, 0.001),
    ];
    for (const state of states) {
      state.bids = state.bids.map(([p]) => [p, "0.00001"]);
      state.asks = state.asks.map(([p]) => [p, "0.00001"]);
    }
    expect(
      new StructuralEngine(fixtureInstrument()).calculate(states, 1135000)
        .coverage,
    ).toBe("INSUFFICIENT_DATA");
  });
  it("preserves the actual observation time and canonical pair without venue-specific metadata", () => {
    const states = [
      fixtureState("binance", 1130000),
      fixtureState("okx", 1131000),
    ];
    const snapshot = new StructuralEngine(fixtureInstrument()).calculate(
      states,
      1135000,
    );
    expect(snapshot.observedAt).toBe(1130000);
    expect(snapshot.calculatedAt).toBe(1135000);
    expect(Object.keys(snapshot.instrument).sort()).toEqual([
      "baseAsset",
      "marketType",
      "quoteAsset",
    ]);
  });
  it("version-tags configuration changes so operator reports cannot silently combine different settings", () => {
    const one = new StructuralEngine(fixtureInstrument());
    const two = new StructuralEngine(fixtureInstrument(), {
      ...DEFAULT_RADAR_CONFIG,
      bandBps: 50,
    });
    expect(one.calculate([], 1000000).scoringVersion).not.toEqual(
      two.calculate([], 1000000).scoringVersion,
    );
  });
});

describe("audit timing and alert deduplication", () => {
  it("waits a full horizon after late first contact", () => {
    const a = audit();
    const points = [
      { at: 1000000, price: 100 },
      { at: 1010000, price: 100 },
      { at: 1020000, price: 102 },
    ];
    const pending = calculateOutcome(a, points, 1020000);
    expect(pending.status).toBe("PENDING");
    expect(pending.windowAnchor).toBe("FIRST_CONTACT");
    expect(pending.evaluationEndAt).toBe(1040000);
    const complete = calculateOutcome(
      a,
      [...points, { at: 1030000, price: 101 }, { at: 1040000, price: 99 }],
      1040000,
    );
    expect(complete.status).toBe("COMPLETE");
    expect(complete.maxReversalAfterContactBps).toBeGreaterThan(200);
  });
  function audit(): PredictionAudit {
    const snapshot = syntheticRadar(0);
    snapshot.observedAt = 1000000;
    snapshot.referencePrice = 100;
    return {
      id: "audit",
      snapshot,
      zone: { ...snapshot.supplyZones[0], lower: 102, upper: 103 },
      horizonMs: 20000,
      scoringVersion: "test",
    };
  }
  it("does not invent contact when observed price jumps over a zone", () => {
    const result = calculateOutcome(
      audit(),
      [
        { at: 1000000, price: 100 },
        { at: 1010000, price: 104, zoneLifecycle: "WEAKENING" },
        { at: 1020000, price: 105 },
      ],
      1020000,
    );
    expect(result.entered).toBe(false);
    expect(result.firstContactAt).toBeNull();
    expect(result.brokeAt).toBe(1010000);
    expect(result.weakenedBeforeBreak).toBe(false);
  });
  it("does not credit stale data as an advance weakening warning", () => {
    const result = calculateOutcome(
      audit(),
      [
        { at: 1000000, price: 100, zoneLifecycle: "STALE" },
        { at: 1010000, price: 102 },
        { at: 1020000, price: 104 },
        { at: 1030000, price: 104 },
      ],
      1030000,
    );
    expect(result.weakenedBeforeBreak).toBe(false);
  });
  it("emits transitions once, including replenishing zones under test", () => {
    const before = syntheticRadar(0),
      next = syntheticRadar(0);
    next.observedAt++;
    next.supplyZones[0].lifecycle = "ABSORBING";
    expect(detectEvents(before, next).map((e) => e.type)).toContain(
      "SUPPLY_APPROACHED",
    );
    expect(detectEvents(next, next)).toEqual([]);
    next.supplyZones[0].lifecycle = "BROKEN";
    expect(detectEvents(before, next).map((e) => e.type)).toContain(
      "ZONE_BROKEN",
    );
  });
  it("coalesces database pressure in a bounded queue", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let saved = 0;
    const queue = new PersistenceQueue(
      async () => {
        saved++;
        await gate;
      },
      1,
      0,
    );
    const one = syntheticRadar(0);
    queue.offer(one);
    queue.offer({ ...one, calculatedAt: one.calculatedAt + 1 });
    queue.offer({ ...one, calculatedAt: one.calculatedAt + 2 });
    expect(queue.size).toBe(1);
    expect(queue.dropped).toBe(1);
    release();
    await queue.close();
    expect(saved).toBe(2);
    expect(queue.offer(one)).toBe(false);
  });
});
