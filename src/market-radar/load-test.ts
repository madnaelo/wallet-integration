import { performance } from "node:perf_hooks";
import { ReconstructedBook } from "./book";
import { DEFAULT_RADAR_CONFIG } from "./config";
import { StructuralEngine } from "./engine";
import { fixtureState } from "./fixtures";
import type { Venue, VenueMarketState } from "./types";

async function run() {
  const markets = Number(process.env.RADAR_LOAD_MARKETS ?? 10);
  const seconds = Number(process.env.RADAR_LOAD_SECONDS ?? 30);
  if (
    !Number.isInteger(markets) ||
    markets < 1 ||
    markets > 50 ||
    !Number.isInteger(seconds) ||
    seconds < 5 ||
    seconds > 120
  )
    throw new Error("Bounded load options required");
  const venues: Venue[] = ["binance", "bybit", "okx"];
  const feeds: {
    state: VenueMarketState;
    book: ReconstructedBook;
    sequence: number;
  }[] = [];
  const engines: StructuralEngine[] = [];
  const beginning = Date.now();
  for (let index = 0; index < markets; index++) {
    for (const venue of venues) {
      const state = fixtureState(venue, beginning);
      state.instrument.baseAsset = `LOAD${index}`;
      state.instrument.symbol = `LOAD${index}USDT`;
      state.historyStartedAt = beginning - 3600000;
      state.trades = Array.from({ length: 5000 }, (_, i) => ({
        id: `seed-${i}`,
        observedAt: beginning - 500000 + i * 100,
        price: 100 + (i % 5) * 0.01,
        quantity: 1,
        aggressor: i % 2 ? ("BUY" as const) : ("SELL" as const),
      }));
      const book = new ReconstructedBook(venue);
      book.apply({
        kind: "snapshot",
        sequence: 1,
        crossSequence: 1,
        observedAt: beginning,
        bids: state.bids,
        asks: state.asks,
      });
      feeds.push({ state, book, sequence: 1 });
    }
    engines.push(new StructuralEngine(feeds[index * 3].state.instrument));
  }
  const cpu = process.cpuUsage();
  const start = performance.now();
  let maxRss = process.memoryUsage().rss;
  const latencies: number[] = [];
  let updates = 0;
  let rounds = 0;
  let nextCalculation = 0;
  while (performance.now() - start < seconds * 1000) {
    const now = Date.now();
    for (const feed of feeds) {
      const previous = feed.sequence++;
      feed.book.apply({
        kind: "delta",
        sequence: feed.sequence,
        firstSequence: feed.sequence,
        previousSequence: previous,
        crossSequence: feed.sequence,
        observedAt: now,
        bids: [["99.99", String(10 + (rounds % 4))]],
        asks: [["100.01", String(10 + (rounds % 5))]],
      });
      const view = feed.book.view(DEFAULT_RADAR_CONFIG.depth);
      Object.assign(feed.state, view, { observedAt: now });
      feed.state.trades.push({
        id: `live-${rounds}`,
        observedAt: now,
        price: 100,
        quantity: 1,
        aggressor: rounds % 2 ? "BUY" : "SELL",
      });
      if (feed.state.trades.length > DEFAULT_RADAR_CONFIG.maxTrades)
        feed.state.trades.shift();
      updates++;
    }
    if (now >= nextCalculation) {
      for (let index = 0; index < markets; index++) {
        const before = performance.now();
        engines[index].calculate(
          feeds.slice(index * 3, index * 3 + 3).map((f) => f.state),
          now,
        );
        latencies.push(performance.now() - before);
      }
      nextCalculation = now + DEFAULT_RADAR_CONFIG.computeEveryMs;
    }
    maxRss = Math.max(maxRss, process.memoryUsage().rss);
    rounds++;
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, rounds * 100 - (performance.now() - start)),
      ),
    );
  }
  const elapsed = (performance.now() - start) / 1000;
  const usage = process.cpuUsage(cpu);
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        kind: "local-synthetic-load",
        node: process.version,
        markets,
        venues: venues.length,
        activeDetailedSubscriptions: feeds.length,
        bookLevelsPerSide: 150,
        initialTradesPerSubscription: 5000,
        seconds: elapsed,
        updates,
        updatesPerSecond: updates / elapsed,
        cpuSeconds: (usage.user + usage.system) / 1e6,
        cpuPercentOfOneCore:
          ((usage.user + usage.system) / 1e6 / elapsed) * 100,
        peakRssMiB: maxRss / 1048576,
        calculations: latencies.length,
        calculationP50Ms: latencies[Math.floor(latencies.length * 0.5)],
        calculationP95Ms:
          latencies[
            Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
          ],
        calculationMaxMs: latencies.at(-1),
        limitations:
          "In-process normalized fixtures; excludes network/TLS, PostgreSQL, multiple replicas and end-user HTTP traffic. Not a production capacity claim.",
      },
      null,
      2,
    ),
  );
}
void run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
