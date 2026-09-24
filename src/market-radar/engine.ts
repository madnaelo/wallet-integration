import { createHash } from "node:crypto";
import { DEFAULT_RADAR_CONFIG, type RadarConfig } from "./config";
import {
  pairKey,
  type LiquidityZone,
  type MarketInstrument,
  type MarketRadarSnapshot,
  type PriceObservation,
  type SignalEvidence,
  type VenueMarketState,
  type ZoneType,
} from "./types";

export const SCORING_VERSION = "structural-v1.0.0";
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};
interface Wall {
  firstAt: number;
  lastAt: number;
  notional: number;
  peak: number;
  cancellations: number;
  samples: number;
  concentrated: boolean;
}
interface Concentration {
  venue: VenueMarketState;
  index: number;
  notional: number;
  ratio: number;
  wall: Wall;
  buy: number;
  sell: number;
  replenishing: number;
  consumed: number;
}

export class StructuralEngine {
  private walls = new Map<string, Wall>();
  private previous = new Map<string, LiquidityZone>();
  private prices: PriceObservation[] = [];
  private lastAt = 0;
  private lastPrice: number | null = null;
  private readonly configurationId: string;
  readonly instrument: Pick<
    MarketInstrument,
    "baseAsset" | "quoteAsset" | "marketType"
  >;
  constructor(
    instrument: Pick<
      MarketInstrument,
      "baseAsset" | "quoteAsset" | "marketType"
    >,
    readonly config: RadarConfig = DEFAULT_RADAR_CONFIG,
  ) {
    this.instrument = {
      baseAsset: instrument.baseAsset,
      quoteAsset: instrument.quoteAsset,
      marketType: instrument.marketType,
    };
    const canonical = Object.fromEntries(
      Object.entries(config)
        .sort()
        .map(([key, value]) => [
          key,
          typeof value === "object"
            ? Object.fromEntries(Object.entries(value).sort())
            : value,
        ]),
    );
    this.configurationId = createHash("sha256")
      .update(JSON.stringify(canonical))
      .digest("hex")
      .slice(0, 12);
  }

  calculate(states: VenueMarketState[], now: number): MarketRadarSnapshot {
    if (!Number.isSafeInteger(now) || now <= this.lastAt)
      throw new Error("Radar clock must advance");
    const step = Math.log1p(this.config.bandBps / 10000);
    const band = (price: number) => Math.floor(Math.log(price) / step);
    const edges = (index: number) => ({
      lower: Math.exp(index * step),
      upper: Math.exp((index + 1) * step),
    });
    const requiredVolume =
      this.config.minimumQuoteVolumes[this.instrument.quoteAsset];
    const requiredDepth = this.config.minimumDepths[this.instrument.quoteAsset];
    const matching = states.filter(
      (s) => pairKey(s.instrument) === pairKey(this.instrument),
    );
    const mids = matching
      .filter(
        (s) =>
          s.healthy &&
          now - s.observedAt <= this.config.staleMs &&
          s.bids.length &&
          s.asks.length,
      )
      .map((s) => (Number(s.bids[0][0]) + Number(s.asks[0][0])) / 2);
    const midpoint = median(mids);
    const qualified = matching
      .filter((s) => {
        const bid = Number(s.bids[0]?.[0]);
        const ask = Number(s.asks[0]?.[0]);
        const mid = (bid + ask) / 2;
        return (
          s.healthy &&
          s.observedAt <= now + 2000 &&
          now - s.observedAt <= this.config.staleMs &&
          s.instrument.discoveredAt >= now - this.config.discoveryEveryMs * 2 &&
          requiredVolume &&
          requiredDepth &&
          s.instrument.quoteVolume24h >= requiredVolume &&
          s.bids.length >= this.config.minimumLevels &&
          s.asks.length >= this.config.minimumLevels &&
          bid > 0 &&
          ask > bid &&
          [s.bids, s.asks].every(
            (levels) =>
              levels.reduce(
                (total, [p, q]) =>
                  total +
                  ((Math.abs(Number(p) - mid) / mid) * 10000 <=
                  this.config.searchBps
                    ? Number(p) * Number(q)
                    : 0),
                0,
              ) >= requiredDepth,
          ) &&
          ((ask - bid) / mid) * 10000 <= this.config.maximumSpreadBps &&
          (Math.abs(mid - midpoint) / midpoint) * 10000 <=
            this.config.maximumVenueDeviationBps
        );
      })
      .filter(
        (s, index, all) =>
          all.findIndex((v) => v.instrument.venue === s.instrument.venue) ===
          index,
      );
    const price = qualified.length
      ? median(
          qualified.map(
            (s) => (Number(s.bids[0][0]) + Number(s.asks[0][0])) / 2,
          ),
        )
      : null;
    const snapshot: MarketRadarSnapshot = {
      instrument: this.instrument,
      referencePrice: price,
      observedAt: qualified.length
        ? Math.min(...qualified.map((s) => s.observedAt))
        : 0,
      calculatedAt: now,
      freshness: qualified.length
        ? "LIVE"
        : matching.length
          ? "STALE"
          : "UNAVAILABLE",
      coverage: "INSUFFICIENT_DATA",
      reason: "Insufficient market depth/data for a reliable structural zone.",
      scoringVersion: `${SCORING_VERSION}+${this.configurationId}`,
      supplyZones: [],
      demandZones: [],
      previousZones: [],
      scoringConfiguration: structuredClone({ ...this.config }),
      venues: matching.map((s) => ({
        venue: s.instrument.venue,
        healthy: qualified.includes(s),
        ageMs: Math.max(0, now - s.observedAt),
        reason: qualified.includes(s)
          ? "Current"
          : s.reason || "Coverage requirements not met",
        continuity: s.continuity,
      })),
      cvd: {
        buyNotional: 0,
        sellNotional: 0,
        delta: 0,
        windowMs: this.config.historyMs,
        historyMs: 0,
      },
      volumeProfile: [],
      priceStructure: {
        recentHigh: null,
        recentLow: null,
        historyMs: 0,
        swingHighs: [],
        swingLows: [],
      },
      scoreMeaning: "STRUCTURAL_CONFLUENCE_NOT_PROBABILITY",
    };
    if (price !== null) this.prices.push({ at: now, price });
    this.prices = this.prices
      .filter((p) => p.at >= now - this.config.historyMs)
      .slice(-20000);
    snapshot.priceStructure = {
      recentHigh: this.prices.length
        ? Math.max(...this.prices.map((p) => p.price))
        : null,
      recentLow: this.prices.length
        ? Math.min(...this.prices.map((p) => p.price))
        : null,
      historyMs: this.prices.length ? now - this.prices[0].at : 0,
      swingHighs: [],
      swingLows: [],
    };
    // Five observations on either side suppress single-tick extrema; only collected history is used.
    for (let i = 5; i < this.prices.length - 5; i++) {
      const center = this.prices[i].price;
      const neighbours = this.prices
        .slice(i - 5, i + 6)
        .filter((_, index) => index !== 5)
        .map((p) => p.price);
      if (neighbours.every((p) => p < center))
        snapshot.priceStructure.swingHighs.push(center);
      if (neighbours.every((p) => p > center))
        snapshot.priceStructure.swingLows.push(center);
    }
    snapshot.priceStructure.swingHighs =
      snapshot.priceStructure.swingHighs.slice(-20);
    snapshot.priceStructure.swingLows =
      snapshot.priceStructure.swingLows.slice(-20);
    snapshot.cvd.historyMs = qualified.length
      ? Math.max(
          0,
          Math.min(
            this.config.historyMs,
            ...qualified.map(
              (s) => now - (s.tradeHistoryStartedAt ?? s.historyStartedAt),
            ),
          ),
        )
      : 0;
    const profile = new Map<number, number>();
    const recentTrades = new Map<string, { buy: number; sell: number }>();
    for (const state of qualified)
      for (const trade of state.trades) {
        if (
          trade.observedAt < now - this.config.historyMs ||
          trade.observedAt > now
        )
          continue;
        const notional = trade.price * trade.quantity;
        if (trade.aggressor === "BUY") snapshot.cvd.buyNotional += notional;
        if (trade.aggressor === "SELL") snapshot.cvd.sellNotional += notional;
        const index = band(trade.price);
        profile.set(index, (profile.get(index) ?? 0) + notional);
        if (trade.observedAt > this.lastAt) {
          const key = `${state.instrument.venue}/${index}`;
          const totals = recentTrades.get(key) ?? { buy: 0, sell: 0 };
          if (trade.aggressor === "BUY") totals.buy += notional;
          if (trade.aggressor === "SELL") totals.sell += notional;
          recentTrades.set(key, totals);
        }
      }
    snapshot.cvd.delta = snapshot.cvd.buyNotional - snapshot.cvd.sellNotional;
    const profileMedian = median([...profile.values()]);
    const sortedProfile = [...profile].sort((a, b) => b[1] - a[1]);
    snapshot.volumeProfile = [
      ...new Map([...sortedProfile.slice(0, 20), ...sortedProfile.slice(-20)]),
    ].map(([index, notional]) => ({
      ...edges(index),
      notional,
      kind:
        notional > profileMedian * 2
          ? "HIGH_VOLUME"
          : notional < profileMedian * 0.5
            ? "LOW_VOLUME"
            : "NORMAL",
    }));
    const age = qualified.length
      ? Math.min(...qualified.map((s) => now - s.historyStartedAt))
      : 0;
    const enough =
      qualified.length >= this.config.minimumVenues &&
      age >= this.config.minimumHistoryMs;
    if (qualified.length && !enough)
      snapshot.reason =
        "Building observations. More healthy venues or a longer history are needed.";
    const venueWeights = new Map(
      qualified.map((s) => [
        s.instrument.venue,
        Math.sqrt(s.instrument.quoteVolume24h),
      ]),
    );
    const weightTotal =
      [...venueWeights.values()].reduce((a, b) => a + b, 0) || 1;
    const concentrations: Record<ZoneType, Concentration[]> = {
      SUPPLY: [],
      DEMAND: [],
    };
    const seen = new Set<string>();
    for (const state of qualified)
      for (const type of ["SUPPLY", "DEMAND"] as const) {
        const grouped = new Map<number, number>();
        for (const [p, q] of type === "SUPPLY" ? state.asks : state.bids) {
          const level = Number(p);
          if (
            !price ||
            (Math.abs(level - price) / price) * 10000 > this.config.searchBps
          )
            continue;
          const index = band(level);
          grouped.set(index, (grouped.get(index) ?? 0) + level * Number(q));
        }
        const total = [...grouped.values()].reduce((a, b) => a + b, 0);
        if (grouped.size < 4 || total < requiredDepth) continue;
        const baseline = median([...grouped.values()]);
        for (const [index, notional] of grouped) {
          const key = `${state.instrument.venue}/${type}/${index}`;
          const previous = this.walls.get(key);
          const { lower, upper } = edges(index);
          if (price && (type === "SUPPLY" ? upper <= price : lower >= price))
            continue;
          if (
            price &&
            (type === "SUPPLY" ? lower <= price : upper >= price) &&
            !previous?.concentrated
          )
            continue;
          const trades = previous
            ? recentTrades.get(`${state.instrument.venue}/${index}`)
            : undefined;
          const buy = trades?.buy ?? 0;
          const sell = trades?.sell ?? 0;
          const executed = type === "SUPPLY" ? buy : sell;
          const ratio = notional / (baseline || 1);
          if (ratio < this.config.wallRatio && !previous) continue;
          const continuous =
            previous &&
            previous.concentrated &&
            ratio >= this.config.wallRatio &&
            previous.notional > 0 &&
            now - previous.lastAt <= this.config.computeEveryMs * 3;
          const wall: Wall = {
            firstAt: continuous ? previous.firstAt : now,
            lastAt: now,
            notional,
            peak: Math.max(notional, previous?.peak ?? 0),
            cancellations: previous?.cancellations ?? 0,
            samples: (previous?.samples ?? 0) + 1,
            concentrated: ratio >= this.config.wallRatio,
          };
          if (
            !continuous &&
            this.lastPrice &&
            price &&
            (type === "SUPPLY"
              ? price > this.lastPrice
              : price < this.lastPrice)
          ) {
            // This is aggregate behaviour, not identification of a particular trader or order.
            const moved = [...this.walls].some(([oldKey, oldWall]) => {
              const [venue, side, oldIndexText] = oldKey.split("/");
              const oldIndex = Number(oldIndexText);
              return (
                venue === state.instrument.venue &&
                side === type &&
                now - oldWall.lastAt <= this.config.computeEveryMs * 2 &&
                (grouped.get(oldIndex) ?? 0) < oldWall.peak * 0.2 &&
                oldWall.peak > notional * 0.5 &&
                oldWall.peak < notional * 2 &&
                (type === "SUPPLY" ? oldIndex < index : oldIndex > index) &&
                Math.abs(oldIndex - index) <= 4
              );
            });
            if (moved) wall.cancellations += 2;
          }
          if (
            previous &&
            previous.notional > notional * 3 &&
            executed < previous.notional * 0.2
          )
            wall.cancellations++;
          this.walls.set(key, wall);
          seen.add(key);
          if (ratio < this.config.wallRatio) continue;
          concentrations[type].push({
            venue: state,
            index,
            notional,
            ratio,
            wall,
            buy,
            sell,
            replenishing:
              previous && previous.notional > 0
                ? clamp(
                    (notional - previous.notional + executed) /
                      Math.max(executed, previous.notional * 0.1),
                  )
                : 0,
            consumed:
              previous && previous.notional > 0
                ? clamp((previous.notional - notional) / previous.notional) *
                  clamp(executed / (previous.notional * 0.25))
                : 0,
          });
        }
      }
    for (const [key, wall] of this.walls) {
      if (
        !seen.has(key) &&
        now - wall.lastAt <= this.config.computeEveryMs * 3 &&
        wall.notional > 0
      ) {
        const [venue, type, index] = key.split("/");
        const fills = recentTrades.get(`${venue}/${index}`);
        const executed = (type === "SUPPLY" ? fills?.buy : fills?.sell) ?? 0;
        if (executed < wall.notional * 0.2) wall.cancellations++;
        wall.notional = 0;
        wall.concentrated = false;
      }
      if (now - wall.lastAt > this.config.historyMs) this.walls.delete(key);
    }
    if (this.walls.size > 2000) {
      for (const [key] of [...this.walls]
        .sort((a, b) => a[1].lastAt - b[1].lastAt)
        .slice(0, this.walls.size - 2000))
        this.walls.delete(key);
    }
    const active = new Set<string>();
    if (enough && price) {
      snapshot.coverage =
        qualified.length >= 3 && age >= 3600000
          ? "STRONG_COVERAGE"
          : qualified.length >= 2
            ? "NORMAL_COVERAGE"
            : "LIMITED_COVERAGE";
      snapshot.reason = "Observed structure, not a prediction of reversal.";
      for (const type of ["SUPPLY", "DEMAND"] as const) {
        const groups: Concentration[][] = [];
        for (const c of concentrations[type].sort(
          (a, b) => a.index - b.index,
        )) {
          const last = groups[groups.length - 1];
          if (last && c.index - last[0].index <= 1) last.push(c);
          else groups.push([c]);
        }
        for (const group of groups) {
          const lower = edges(group[0].index).lower;
          const upper = edges(group[group.length - 1].index).upper;
          const zoneId = `${pairKey(this.instrument)}/${type}/${group[0].index}`;
          const previous = this.previous.get(zoneId);
          const notional = group.reduce((sum, c) => sum + c.notional, 0);
          const venues = [
            ...new Set(group.map((c) => c.venue.instrument.venue)),
          ].map((venue) => ({
            venue,
            weight: venueWeights.get(venue)! / weightTotal,
            notional: group
              .filter((c) => c.venue.instrument.venue === venue)
              .reduce((sum, c) => sum + c.notional, 0),
          }));
          const firstAt = Math.max(...group.map((c) => c.wall.firstAt));
          const persistence = now - firstAt;
          const reliability = clamp(
            1 -
              (group.reduce((sum, c) => sum + c.wall.cancellations, 0) /
                Math.max(1, group.length)) *
                0.2,
          );
          const executedBuy = group.reduce((sum, c) => sum + c.buy, 0);
          const executedSell = group.reduce((sum, c) => sum + c.sell, 0);
          const executed = type === "SUPPLY" ? executedBuy : executedSell;
          const consumed =
            group.reduce(
              (sum, c) =>
                sum + c.consumed * (type === "SUPPLY" ? c.buy : c.sell),
              0,
            ) / Math.max(executed, 1);
          const replenished =
            group.reduce(
              (sum, c) =>
                sum + c.replenishing * (type === "SUPPLY" ? c.buy : c.sell),
              0,
            ) / Math.max(executed, 1);
          const absorption =
            executed === 0
              ? "NOT_ENOUGH_TRADES"
              : consumed > 0.35
                ? "BEING_CONSUMED"
                : replenished > 0.6
                  ? "REPLENISHING"
                  : "LOW";
          const historic = [...new Set(group.map((c) => c.index))].reduce(
            (sum, index) => sum + (profile.get(index) ?? 0),
            0,
          );
          const contacts = (
            type === "SUPPLY"
              ? snapshot.priceStructure.swingHighs
              : snapshot.priceStructure.swingLows
          ).filter((p) => p >= lower && p <= upper).length;
          const components: [string, string, number, number][] = [
            [
              "magnitude",
              "Unusually concentrated visible liquidity",
              clamp(Math.log2(Math.max(...group.map((c) => c.ratio))) / 4),
              0.2,
            ],
            [
              "persistence",
              "Liquidity stayed in this price area",
              clamp(Math.log1p(persistence / 60000) / Math.log(241)),
              0.2,
            ],
            [
              "consensus",
              "Liquidity-weighted venue agreement",
              venues.reduce((sum, v) => sum + v.weight, 0) *
                Math.min(1, venues.length / 3),
              0.2,
            ],
            [
              "history",
              "Executed volume at these prices",
              clamp(historic / Math.max(profileMedian * 3, 1)),
              0.05,
            ],
            [
              "price_structure",
              `Prior observed price contacts: ${contacts}`,
              clamp(contacts / 3),
              0.05,
            ],
            [
              "absorption",
              "Visible liquidity surviving incoming trades",
              absorption === "REPLENISHING"
                ? 1
                : absorption === "BEING_CONSUMED"
                  ? 0.05
                  : 0.4,
              0.1,
            ],
            [
              "reliability",
              "Consistency of the visible wall",
              reliability,
              0.1,
            ],
            [
              "quality",
              "Healthy, current market coverage",
              (clamp(qualified.length / 3) *
                clamp(age / 3600000) *
                qualified.reduce(
                  (sum, s) => sum + (s.continuity === "VERIFIED" ? 1 : 0.8),
                  0,
                )) /
                qualified.length,
              0.1,
            ],
          ];
          const evidence: SignalEvidence[] = components.map(
            ([key, label, value, weight]) => ({
              key,
              label,
              value,
              weight,
              contribution: value * weight * 100,
            }),
          );
          const maturity = 0.25 + 0.75 * clamp(persistence / 3600000);
          const strength = Math.round(
            evidence.reduce((sum, e) => sum + e.contribution, 0) *
              maturity *
              (0.5 + 0.5 * reliability),
          );
          const near =
            ((type === "SUPPLY" ? lower - price : price - upper) / price) *
              10000 <=
            this.config.bandBps;
          const lifecycle =
            absorption === "BEING_CONSUMED"
              ? "WEAKENING"
              : absorption === "REPLENISHING" && near
                ? "ABSORBING"
                : near
                  ? "UNDER_TEST"
                  : persistence < this.config.minimumHistoryMs
                    ? "FORMING"
                    : previous && strength <= previous.strength - 8
                      ? "WEAKENING"
                      : previous && strength >= previous.strength + 8
                        ? "STRENGTHENING"
                        : "ACTIVE";
          const zone: LiquidityZone = {
            id: zoneId,
            type,
            lower,
            upper,
            strength,
            lifecycle,
            persistenceMs: persistence,
            notional,
            notionalTrend:
              previous && notional > previous.notional * 1.1
                ? "INCREASING"
                : previous && notional < previous.notional * 0.9
                  ? "DECREASING"
                  : "STABLE",
            wallReliability: Math.round(reliability * 100),
            absorption,
            aggressiveBuyNotional: executedBuy,
            aggressiveSellNotional: executedSell,
            venues,
            evidence,
            scoreFactors: { maturity, reliability: 0.5 + 0.5 * reliability },
            observedAt: snapshot.observedAt,
            firstObservedAt: firstAt,
            scoreHistory: [
              ...(previous?.scoreHistory ?? []),
              { at: now, score: strength },
            ].slice(-24),
          };
          this.previous.set(zoneId, zone);
          active.add(zoneId);
          (type === "SUPPLY"
            ? snapshot.supplyZones
            : snapshot.demandZones
          ).push(zone);
        }
      }
    }
    for (const [id, previous] of this.previous) {
      if (active.has(id)) continue;
      const broken =
        price !== null &&
        (previous.type === "SUPPLY"
          ? price > previous.upper
          : price < previous.lower);
      snapshot.previousZones.push({
        ...previous,
        lifecycle: broken ? "BROKEN" : !enough ? "STALE" : "WEAKENING",
        observedAt: now,
      });
      if (now - previous.observedAt > this.config.historyMs)
        this.previous.delete(id);
    }
    snapshot.supplyZones.sort((a, b) => a.lower - b.lower);
    snapshot.demandZones.sort((a, b) => b.upper - a.upper);
    snapshot.supplyZones = snapshot.supplyZones.slice(0, 3);
    snapshot.demandZones = snapshot.demandZones.slice(0, 3);
    snapshot.previousZones = snapshot.previousZones.slice(-6);
    if (this.previous.size > 200)
      for (const [id] of [...this.previous]
        .sort((a, b) => a[1].observedAt - b[1].observedAt)
        .slice(0, this.previous.size - 200))
        this.previous.delete(id);
    this.lastAt = now;
    this.lastPrice = price;
    return snapshot;
  }
}
