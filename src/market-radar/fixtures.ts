// Deterministic local fixtures for tests and load measurements, never used by the live collector.
import type { MarketInstrument, Venue, VenueMarketState } from "./types";

export function fixtureInstrument(venue: Venue = "binance"): MarketInstrument {
  return {
    venue,
    symbol: "TESTUSDT",
    baseAsset: "TEST",
    quoteAsset: "USDT",
    marketType: "SPOT",
    priceTick: 0.01,
    quoteVolume24h: 1e8,
    bestBid: 99.99,
    bestAsk: 100.01,
    discoveredAt: 1000000,
  };
}
export function fixtureState(
  venue: Venue,
  now: number,
  wallQuantity = 1000,
): VenueMarketState {
  const bids: [string, string][] = [];
  const asks: [string, string][] = [];
  for (let i = 0; i < 150; i++) {
    bids.push([
      (99.99 - i * 0.02).toFixed(2),
      i >= 90 && i <= 99 ? String(wallQuantity) : "10",
    ]);
    asks.push([
      (100.01 + i * 0.02).toFixed(2),
      i >= 90 && i <= 99 ? String(wallQuantity) : "10",
    ]);
  }
  return {
    instrument: { ...fixtureInstrument(venue), discoveredAt: now },
    observedAt: now,
    healthy: true,
    reason: "",
    continuity: "VERIFIED",
    bids,
    asks,
    trades: [],
    historyStartedAt: 1000000,
  };
}
