export interface RadarConfig {
  continuousMarkets: number;
  onDemandMarkets: number;
  venuesPerMarket: number;
  depth: number;
  inactiveTtlMs: number;
  staleMs: number;
  historyMs: number;
  minimumHistoryMs: number;
  minimumVenues: number;
  minimumLevels: number;
  maximumSpreadBps: number;
  maximumVenueDeviationBps: number;
  bandBps: number;
  searchBps: number;
  wallRatio: number;
  computeEveryMs: number;
  minimumQuoteVolumes: Record<string, number>;
  minimumDepths: Record<string, number>;
  maxFrameBytes: number;
  maxBufferedDeltas: number;
  maxTrades: number;
  maxCatalog: number;
  discoveryEveryMs: number;
  maxReconnectDelayMs: number;
  reconnectPerMinute: number;
}
export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  continuousMarkets: 5,
  onDemandMarkets: 5,
  venuesPerMarket: 3,
  depth: 200,
  inactiveTtlMs: 300000,
  staleMs: 15000,
  historyMs: 3600000,
  minimumHistoryMs: 120000,
  minimumVenues: 2,
  minimumLevels: 20,
  maximumSpreadBps: 50,
  maximumVenueDeviationBps: 100,
  bandBps: 25,
  searchBps: 1500,
  wallRatio: 2.5,
  computeEveryMs: 5000,
  minimumQuoteVolumes: {
    USDT: 1000000,
    USDC: 1000000,
    USD: 1000000,
    BTC: 10,
    ETH: 100,
  },
  minimumDepths: { USDT: 10000, USDC: 10000, USD: 10000, BTC: 0.1, ETH: 1 },
  maxFrameBytes: 1048576,
  maxBufferedDeltas: 256,
  maxTrades: 20000,
  maxCatalog: 10000,
  discoveryEveryMs: 300000,
  maxReconnectDelayMs: 60000,
  reconnectPerMinute: 12,
};
export function radarConfig(
  env: Record<string, string | undefined>,
): RadarConfig {
  const result = structuredClone(DEFAULT_RADAR_CONFIG);
  const options = {
    RADAR_CONTINUOUS_MARKETS: ["continuousMarkets", 0, 50],
    RADAR_ON_DEMAND_MARKETS: ["onDemandMarkets", 0, 50],
    RADAR_VENUES_PER_MARKET: ["venuesPerMarket", 1, 3],
    RADAR_DEPTH: ["depth", 20, 200],
    RADAR_INACTIVE_TTL_MS: ["inactiveTtlMs", 60000, 3600000],
    RADAR_STALE_MS: ["staleMs", 5000, 60000],
    RADAR_HISTORY_MS: ["historyMs", 300000, 86400000],
    RADAR_MINIMUM_HISTORY_MS: ["minimumHistoryMs", 60000, 3600000],
    RADAR_MINIMUM_VENUES: ["minimumVenues", 1, 3],
    RADAR_MAXIMUM_SPREAD_BPS: ["maximumSpreadBps", 1, 200],
    RADAR_COMPUTE_EVERY_MS: ["computeEveryMs", 1000, 30000],
    RADAR_RECONNECT_PER_MINUTE: ["reconnectPerMinute", 1, 60],
    RADAR_MAX_FRAME_BYTES: ["maxFrameBytes", 65536, 1048576],
    RADAR_MAX_BUFFERED_DELTAS: ["maxBufferedDeltas", 16, 256],
    RADAR_MAX_TRADES: ["maxTrades", 100, 20000],
    RADAR_MAX_CATALOG: ["maxCatalog", 100, 10000],
    RADAR_DISCOVERY_EVERY_MS: ["discoveryEveryMs", 300000, 3600000],
  } as const;
  for (const [name, [key, min, max]] of Object.entries(options)) {
    if (env[name] === undefined) continue;
    const value = Number(env[name]);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid ${name}`);
    result[key] = value;
  }
  for (const [name, key] of [
    ["RADAR_MIN_QUOTE_VOLUMES", "minimumQuoteVolumes"],
    ["RADAR_MIN_DEPTHS", "minimumDepths"],
  ] as const) {
    if (!env[name]) continue;
    if (env[name]!.length > 4096) throw new Error(`Invalid ${name}`);
    const raw: unknown = JSON.parse(env[name]!);
    if (!raw || Array.isArray(raw) || typeof raw !== "object")
      throw new Error(`Invalid ${name}`);
    for (const [asset, value] of Object.entries(raw)) {
      if (
        !/^[A-Z0-9._-]{1,32}$/.test(asset) ||
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value <= 0
      )
        throw new Error(`Invalid ${name}`);
    }
    result[key] = raw as Record<string, number>;
  }
  if (result.minimumHistoryMs > result.historyMs)
    throw new Error("Minimum history exceeds retention");
  return result;
}
