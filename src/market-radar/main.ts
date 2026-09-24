import { MarketCollector } from "./collector";
import { radarConfig } from "./config";
import { radarServer } from "./http-server";
import { PersistenceQueue } from "./persistence-queue";
import { permittedVenues } from "./policy";
import { RadarStore } from "./store";
import type { Venue } from "./types";

async function main() {
  const mode = process.env.RADAR_MODE ?? "disabled";
  if (!["disabled", "research", "commercial"].includes(mode))
    throw new Error("Invalid RADAR_MODE");
  const port = Number(process.env.RADAR_PORT ?? 8092);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid RADAR_PORT");
  const retentionDays = Number(process.env.RADAR_RETENTION_DAYS ?? 7);
  if (
    !Number.isInteger(retentionDays) ||
    retentionDays < 2 ||
    retentionDays > 90
  )
    throw new Error("Invalid RADAR_RETENTION_DAYS");
  const internalToken = process.env.RADAR_INTERNAL_TOKEN ?? "";
  const publicReadToken = process.env.RADAR_PUBLIC_READ_TOKEN ?? "";
  let store: RadarStore | null = null;
  let collector: MarketCollector | null = null;
  let queue: PersistenceQueue | null = null;
  if (mode !== "disabled") {
    if (
      internalToken.length < 32 ||
      (mode === "commercial" &&
        (publicReadToken.length < 32 || publicReadToken === internalToken))
    )
      throw new Error("Distinct strong service credentials required");
    const requested = (process.env.RADAR_VENUES ?? "binance").split(",");
    if (requested.some((v) => !["binance", "bybit", "okx"].includes(v)))
      throw new Error("Invalid RADAR_VENUES");
    if (
      permittedVenues(mode as "research" | "commercial", requested as Venue[])
        .length !== requested.length
    )
      throw new Error(
        "Data rights do not permit a requested venue in this mode",
      );
    if (
      mode === "commercial" &&
      process.env.MARKET_RADAR_LIVE_ENABLED !== "true"
    )
      throw new Error("Commercial live feature is disabled");
    store = new RadarStore(
      process.env.RADAR_DATABASE_URL ?? "",
      mode as "research" | "commercial",
      process.env.RADAR_AUDIT_HORIZONS_MS?.split(",").map(Number),
    );
    await store.check();
    queue = new PersistenceQueue((snapshot) => store!.observe(snapshot));
    collector = new MarketCollector(
      radarConfig(process.env),
      mode as "research" | "commercial",
      requested as Venue[],
      (snapshot) => {
        queue!.offer(snapshot);
      },
      (markets) => store!.catalog(markets),
    );
  }
  const server = radarServer({
    collector,
    store,
    mode: mode as "disabled" | "research" | "commercial",
    internalToken,
    publicReadToken,
    env: process.env,
  });
  let maintaining = false;
  let nextCleanup = 0;
  const timer = setInterval(() => {
    if (!store || maintaining) return;
    maintaining = true;
    void (async () => {
      await store.evaluateDue();
      if (collector)
        collector.watch(
          await store.watchedPairs(collector.config.onDemandMarkets),
        );
      if (Date.now() >= nextCleanup) {
        await store.cleanup(Date.now(), retentionDays);
        nextCleanup = Date.now() + 60000;
      }
      if (collector && queue)
        collector.metrics.persistenceFailures = queue.failures;
    })()
      .catch(() => {
        console.error("Market Radar maintenance temporarily unavailable");
      })
      .finally(() => {
        maintaining = false;
      });
  }, 10000);
  server.listen(port, process.env.RADAR_BIND_ADDRESS ?? "127.0.0.1", () => {
    console.info(JSON.stringify({ service: "market-radar", mode, port }));
    collector?.start();
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    collector?.stop();
    server.close();
    server.closeIdleConnections();
    const deadline = setTimeout(() => process.exit(1), 15000);
    deadline.unref();
    void (async () => {
      await queue?.close();
      await store?.close();
      clearTimeout(deadline);
    })().catch(() => (process.exitCode = 1));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main().catch(() => {
  console.error(
    "Market Radar startup failed; check validated configuration and database readiness.",
  );
  process.exitCode = 1;
});
