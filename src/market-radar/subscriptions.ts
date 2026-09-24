import type { RadarConfig } from "./config";
import { pairKey, type MarketInstrument } from "./types";

export class SubscriptionPlanner {
  private watched = new Map<string, number>();
  constructor(private readonly config: RadarConfig) {}
  qualify(
    catalog: MarketInstrument[],
    now: number,
  ): Map<string, MarketInstrument[]> {
    const groups = new Map<string, MarketInstrument[]>();
    for (const instrument of catalog) {
      const minimum = this.config.minimumQuoteVolumes[instrument.quoteAsset];
      if (
        !minimum ||
        instrument.quoteVolume24h < minimum ||
        now - instrument.discoveredAt > this.config.discoveryEveryMs * 2
      )
        continue;
      const spread =
        ((instrument.bestAsk - instrument.bestBid) /
          ((instrument.bestAsk + instrument.bestBid) / 2)) *
        10000;
      if (spread <= 0 || spread > this.config.maximumSpreadBps) continue;
      const key = pairKey(instrument);
      const group = groups.get(key) ?? [];
      if (!group.some((i) => i.venue === instrument.venue))
        group.push(instrument);
      groups.set(key, group);
    }
    return new Map(
      [...groups].filter(([, v]) => v.length >= this.config.minimumVenues),
    );
  }
  watch(key: string, catalog: MarketInstrument[], now: number): boolean {
    const qualified = this.qualify(catalog, now);
    if (!qualified.has(key)) return false;
    this.expire(now);
    const permanent = this.continuous(qualified);
    if (permanent.includes(key)) return true;
    if (
      !this.watched.has(key) &&
      this.watched.size >= this.config.onDemandMarkets
    )
      return false;
    this.watched.set(key, now + this.config.inactiveTtlMs);
    return true;
  }
  private expire(now: number) {
    for (const [key, expiry] of this.watched)
      if (expiry <= now) this.watched.delete(key);
  }
  private continuous(groups: Map<string, MarketInstrument[]>): string[] {
    // Rank by volume relative to a configured threshold in the same quote currency; no assumed FX conversion.
    return [...groups]
      .sort((a, b) => this.liquidity(b[1]) - this.liquidity(a[1]))
      .slice(0, this.config.continuousMarkets)
      .map(([key]) => key);
  }
  private liquidity(group: MarketInstrument[]) {
    return group.reduce(
      (sum, i) =>
        sum + i.quoteVolume24h / this.config.minimumQuoteVolumes[i.quoteAsset],
      0,
    );
  }
  plan(catalog: MarketInstrument[], now: number): MarketInstrument[] {
    this.expire(now);
    const groups = this.qualify(catalog, now);
    const keys = new Set([...this.continuous(groups), ...this.watched.keys()]);
    return [...keys].flatMap((key) =>
      (groups.get(key) ?? [])
        .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
        .slice(0, this.config.venuesPerMarket),
    );
  }
}
