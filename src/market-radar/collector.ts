import { performance } from "node:perf_hooks";
import { discoverInstruments, discoveryPaths, ENDPOINTS } from "./adapters";
import type { RadarConfig } from "./config";
import { StructuralEngine } from "./engine";
import { permittedVenues } from "./policy";
import { SubscriptionPlanner } from "./subscriptions";
import {
  ConnectionBudget,
  exchangeTransport,
  RadarMetrics,
  VenueFeed,
  VenueRequestBudget,
} from "./transport";
import {
  instrumentKey,
  pairKey,
  type MarketInstrument,
  type MarketRadarSnapshot,
  type Venue,
} from "./types";

export class MarketCollector {
  readonly metrics = new RadarMetrics();
  private catalog: MarketInstrument[] = [];
  private feeds = new Map<string, VenueFeed>();
  private engines = new Map<string, StructuralEngine>();
  private snapshots = new Map<string, MarketRadarSnapshot>();
  private planner: SubscriptionPlanner;
  private budgets: Record<Venue, VenueRequestBudget> = {
    binance: new VenueRequestBudget(
      fetch,
      1000,
      () => this.metrics.rateLimited++,
    ),
    bybit: new VenueRequestBudget(
      fetch,
      1000,
      () => this.metrics.rateLimited++,
    ),
    okx: new VenueRequestBudget(fetch, 1000, () => this.metrics.rateLimited++),
  };
  private connectionBudget: ConnectionBudget;
  private timer?: ReturnType<typeof setInterval>;
  private nextDiscovery = 0;
  private discoveryPending = false;
  readonly allowedVenues: Venue[];
  constructor(
    readonly config: RadarConfig,
    mode: "research" | "commercial",
    requested: Venue[],
    private readonly onSnapshot: (snapshot: MarketRadarSnapshot) => void = () =>
      undefined,
    private readonly onCatalog: (
      markets: { key: string; venues: Venue[] }[],
    ) => Promise<void> = async () => undefined,
  ) {
    this.allowedVenues = permittedVenues(mode, requested);
    this.planner = new SubscriptionPlanner(config);
    this.connectionBudget = new ConnectionBudget(config.reconnectPerMinute);
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.config.computeEveryMs);
    this.tick();
  }
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    for (const feed of this.feeds.values()) feed.stop();
    this.feeds.clear();
  }
  private tick() {
    const now = Date.now();
    if (now >= this.nextDiscovery && !this.discoveryPending) {
      this.discoveryPending = true;
      this.nextDiscovery = now + this.config.discoveryEveryMs;
      void this.discover().finally(() => {
        this.discoveryPending = false;
      });
    }
    const planned = this.planner.plan(this.catalog, now);
    const keys = new Set(planned.map(instrumentKey));
    for (const [key, feed] of this.feeds)
      if (!keys.has(key)) {
        feed.stop();
        this.feeds.delete(key);
      }
    const transport = exchangeTransport(this.budgets);
    for (const instrument of planned) {
      const key = instrumentKey(instrument);
      const existing = this.feeds.get(key);
      if (existing) {
        Object.assign(existing.instrument, instrument);
        continue;
      }
      const feed = new VenueFeed(
        instrument,
        this.config,
        transport,
        this.connectionBudget,
        this.metrics,
      );
      this.feeds.set(key, feed);
      feed.start();
    }
    const pairs = new Set(planned.map(pairKey));
    for (const key of this.engines.keys())
      if (!pairs.has(key)) {
        this.engines.delete(key);
        this.snapshots.delete(key);
      }
    this.metrics.zones = 0;
    for (const key of pairs) {
      const states = [...this.feeds.values()]
        .filter((f) => pairKey(f.instrument) === key)
        .map((f) => f.state(now));
      if (!states.length) continue;
      let engine = this.engines.get(key);
      if (!engine) {
        engine = new StructuralEngine(states[0].instrument, this.config);
        this.engines.set(key, engine);
      }
      const start = performance.now();
      try {
        const snapshot = engine.calculate(states, now);
        this.snapshots.set(key, snapshot);
        this.onSnapshot(snapshot);
        this.metrics.zones +=
          snapshot.supplyZones.length + snapshot.demandZones.length;
        this.metrics.unreliableWalls += [
          ...snapshot.supplyZones,
          ...snapshot.demandZones,
        ].filter((z) => z.wallReliability < 60).length;
      } catch {
        this.snapshots.delete(key);
        this.metrics.calculationFailures++;
      }
      const elapsed = performance.now() - start;
      this.metrics.calculations++;
      this.metrics.computeTotalMs += elapsed;
      this.metrics.computeMaxMs = Math.max(this.metrics.computeMaxMs, elapsed);
    }
  }
  private async discover() {
    for (const venue of this.allowedVenues) {
      try {
        const [instrumentsPath, tickersPath] = discoveryPaths(venue);
        const instruments = await this.budgets[venue].get(
          ENDPOINTS[venue].rest,
          instrumentsPath,
        );
        const tickers = await this.budgets[venue].get(
          ENDPOINTS[venue].rest,
          tickersPath,
        );
        const discovered = discoverInstruments(
          venue,
          instruments,
          tickers,
          Date.now(),
        ).slice(0, this.config.maxCatalog);
        this.catalog = [
          ...this.catalog.filter((i) => i.venue !== venue),
          ...discovered,
        ];
        this.metrics.lastDiscoveryError = "";
      } catch {
        this.metrics.lastDiscoveryError = `${venue}: discovery unavailable`;
      }
    }
    try {
      await this.onCatalog(
        [...this.planner.qualify(this.catalog, Date.now())].map(
          ([key, items]) => ({ key, venues: items.map((i) => i.venue) }),
        ),
      );
    } catch {
      this.metrics.persistenceFailures++;
    }
  }
  watch(keys: string[]) {
    for (const key of keys.slice(0, this.config.onDemandMarkets))
      this.planner.watch(key, this.catalog, Date.now());
  }
  markets(query: string, now = Date.now()) {
    return [...this.planner.qualify(this.catalog, now)]
      .filter(([key]) => key.includes(query.toUpperCase()))
      .slice(0, 100)
      .map(([key, items]) => ({
        key,
        baseAsset: items[0].baseAsset,
        quoteAsset: items[0].quoteAsset,
        marketType: items[0].marketType,
        venues: items.map((i) => i.venue),
      }));
  }
  snapshot(key: string) {
    if (!this.planner.watch(key, this.catalog, Date.now())) return null;
    const snapshot = this.snapshots.get(key);
    if (!snapshot || Date.now() - snapshot.observedAt > this.config.staleMs)
      return null;
    return snapshot;
  }
  health() {
    return {
      allowedVenues: this.allowedVenues,
      activeInstruments: this.engines.size,
      activeDetailedSubscriptions: this.feeds.size,
      catalogSize: this.catalog.length,
      venues: [...this.feeds].map(([key, feed]) => ({
        key,
        healthy: feed.state().healthy,
        reason: feed.state().reason,
      })),
      metrics: this.metrics.snapshot(),
    };
  }
}
