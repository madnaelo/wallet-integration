import type { LiquidityZone, MarketRadarSnapshot } from "@/market-radar/types";

const observedAt = Date.UTC(2026, 0, 1, 12);
function zone(type: "SUPPLY" | "DEMAND", phase: number): LiquidityZone {
  const supply = type === "SUPPLY";
  const strength = supply ? [84, 67, 43][phase] : 71;
  const points = supply
    ? [
        [27, 27, 16, 14],
        [27, 21, 16, 3],
        [27, 10, 5, 1],
      ][phase]
    : [24, 21, 16, 10];
  return {
    id: `synthetic-${type}`,
    type,
    lower: supply ? 128.7 : 112.2,
    upper: supply ? 130.1 : 114,
    strength,
    lifecycle: supply && phase > 0 ? "WEAKENING" : "ACTIVE",
    persistenceMs: supply ? 26280000 : 18420000,
    notional: supply ? [4200000, 3100000, 1600000][phase] : 2800000,
    notionalTrend: supply && phase > 0 ? "DECREASING" : "INCREASING",
    wallReliability: supply ? 94 : 87,
    absorption: supply && phase > 0 ? "BEING_CONSUMED" : "LOW",
    aggressiveBuyNotional: supply ? [120000, 760000, 2400000][phase] : 180000,
    aggressiveSellNotional: 260000,
    venues: [
      { venue: "binance", weight: 0.4, notional: 1600000 },
      { venue: "bybit", weight: 0.3, notional: 1300000 },
      { venue: "okx", weight: 0.2, notional: 1300000 },
    ],
    evidence: [
      {
        key: "persistence",
        label: "Persistent visible liquidity",
        value: points[0] / 30,
        weight: 0.3,
        contribution: points[0],
      },
      {
        key: "consensus",
        label: "Three liquid venues aligned",
        value: points[1] / 30,
        weight: 0.3,
        contribution: points[1],
      },
      {
        key: "history",
        label: "Prior high-activity price area",
        value: points[2] / 20,
        weight: 0.2,
        contribution: points[2],
      },
      {
        key: "absorption",
        label:
          supply && phase > 0
            ? "Visible supply being consumed"
            : "Low consumption of visible liquidity",
        value: points[3] / 20,
        weight: 0.2,
        contribution: points[3],
      },
    ],
    scoreFactors: { maturity: 1, reliability: 1 },
    observedAt,
    firstObservedAt: observedAt - 26280000,
    scoreHistory: (supply ? [84, 67, 43].slice(0, phase + 1) : [71]).map(
      (score, index) => ({ at: observedAt + index * 60000, score }),
    ),
  };
}

// Deliberately hand-authored, not imported from any exchange, live engine or provider client.
export function syntheticRadar(phase: number): MarketRadarSnapshot {
  const step = Math.max(0, Math.min(2, Math.floor(phase)));
  return {
    instrument: { baseAsset: "SOL", quoteAsset: "USDT", marketType: "SPOT" },
    referencePrice: [121.4, 126.2, 128.9][step],
    observedAt,
    calculatedAt: observedAt,
    freshness: "LIVE",
    coverage: "STRONG_COVERAGE",
    reason: "Synthetic illustration only.",
    scoringVersion: "illustrative-not-a-live-model",
    scoringConfiguration: {
      bandBps: 25,
      searchBps: 1500,
      wallRatio: 2.5,
      minimumVenues: 2,
      minimumHistoryMs: 120000,
      minimumQuoteVolume: 1000000,
      minimumDepth: 10000,
    },
    supplyZones: [zone("SUPPLY", step)],
    demandZones: [zone("DEMAND", step)],
    previousZones: [],
    venues: [
      {
        venue: "binance",
        healthy: true,
        ageMs: 0,
        reason: "Synthetic",
        continuity: "ILLUSTRATIVE",
      },
      {
        venue: "bybit",
        healthy: true,
        ageMs: 0,
        reason: "Synthetic",
        continuity: "ILLUSTRATIVE",
      },
      {
        venue: "okx",
        healthy: true,
        ageMs: 0,
        reason: "Synthetic",
        continuity: "ILLUSTRATIVE",
      },
      {
        venue: "illustrative",
        healthy: true,
        ageMs: 0,
        reason: "Synthetic fourth venue",
        continuity: "ILLUSTRATIVE",
      },
    ],
    cvd: {
      buyNotional: [500000, 1200000, 3300000][step],
      sellNotional: 420000,
      delta: [80000, 780000, 2880000][step],
      windowMs: 3600000,
      historyMs: 3600000,
    },
    volumeProfile: [],
    priceStructure: {
      recentHigh: 130.1,
      recentLow: 112.2,
      historyMs: 28800000,
      swingHighs: [130.1],
      swingLows: [112.2],
    },
    scoreMeaning: "STRUCTURAL_CONFLUENCE_NOT_PROBABILITY",
  };
}
