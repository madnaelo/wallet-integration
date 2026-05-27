function optional(name: string, fallback: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return fallback;
  return v;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optionalBoolean(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v || v.trim().length === 0) return fallback;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export const env = {
  ZEROX_API_KEY: optional("ZEROX_API_KEY", ""),
  ONEINCH_API_KEY: optional("ONEINCH_API_KEY", ""),
  SWAP_PROVIDERS: optional("SWAP_PROVIDERS", "0x,1inch,paraswap,odos,lifi"),
  PARASWAP_BASE_URL: optional("PARASWAP_BASE_URL", "https://api.paraswap.io"),
  PARASWAP_API_KEY: optional("PARASWAP_API_KEY", ""),
  PARASWAP_API_KEY_HEADER: optional("PARASWAP_API_KEY_HEADER", "X-API-Key"),
  PARASWAP_PARTNER: optional("PARASWAP_PARTNER", "thewallet"),
  ODOS_BASE_URL: optional("ODOS_BASE_URL", "https://api.odos.xyz"),
  ODOS_API_KEY: optional("ODOS_API_KEY", ""),
  LIFI_BASE_URL: optional("LIFI_BASE_URL", "https://li.quest"),
  LIFI_API_KEY: optional("LIFI_API_KEY", ""),
  LIFI_INTEGRATOR: optional("LIFI_INTEGRATOR", ""),
  AFFILIATE_ADDRESS: optional("AFFILIATE_ADDRESS", "0x0000000000000000000000000000000000000000"),
  FEE_RECIPIENT_ADDRESS: optional("FEE_RECIPIENT_ADDRESS", ""),
  PLATFORM_FEE_BPS: optionalNumber("PLATFORM_FEE_BPS", 20),
  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", "http://localhost:3000"),
  REQUIRE_ALLOWED_ORIGIN: optionalBoolean("REQUIRE_ALLOWED_ORIGIN", false),
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 30),
  UPSTASH_REDIS_REST_URL: optional("UPSTASH_REDIS_REST_URL", ""),
  UPSTASH_REDIS_REST_TOKEN: optional("UPSTASH_REDIS_REST_TOKEN", ""),
  RATE_LIMIT_REDIS_PREFIX: optional("RATE_LIMIT_REDIS_PREFIX", "wallet"),
  RATE_LIMIT_REDIS_FAIL_OPEN: optionalBoolean("RATE_LIMIT_REDIS_FAIL_OPEN", false),
  QUOTE_CACHE_TTL_MS: optionalNumber("QUOTE_CACHE_TTL_MS", 8_000),
  QUOTE_CACHE_MAX_ENTRIES: optionalNumber("QUOTE_CACHE_MAX_ENTRIES", 2_000)
};
