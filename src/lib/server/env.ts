import {
  DEFAULT_MONETIZED_SWAP_PROVIDERS,
  DEFAULT_SWAP_PROVIDERS
} from "@/lib/server/providerCommercialPolicy";

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

function normalizeLegacyBrandValue(value: string): string {
  return value.trim() === "thewallet" ? "swapassistant" : value;
}

function redisRestCredentials(): { url: string; token: string } {
  const canonicalUrl = optional("UPSTASH_REDIS_REST_URL", "");
  const canonicalToken = optional("UPSTASH_REDIS_REST_TOKEN", "");
  if (canonicalUrl || canonicalToken) {
    return { url: canonicalUrl, token: canonicalToken };
  }
  return {
    url: optional("KV_REST_API_URL", ""),
    token: optional("KV_REST_API_TOKEN", "")
  };
}

const redisRest = redisRestCredentials();

export const env = {
  ZEROX_API_KEY: optional("ZEROX_API_KEY", ""),
  ONEINCH_API_KEY: optional("ONEINCH_API_KEY", ""),
  SWAP_PROVIDERS: optional("SWAP_PROVIDERS", DEFAULT_SWAP_PROVIDERS.join(",")),
  MONETIZED_SWAP_PROVIDERS: optional(
    "MONETIZED_SWAP_PROVIDERS",
    DEFAULT_MONETIZED_SWAP_PROVIDERS.join(",")
  ),
  PARASWAP_BASE_URL: optional("PARASWAP_BASE_URL", "https://api.paraswap.io"),
  PARASWAP_API_KEY: optional("PARASWAP_API_KEY", ""),
  PARASWAP_API_KEY_HEADER: optional("PARASWAP_API_KEY_HEADER", "X-API-Key"),
  PARASWAP_PARTNER: normalizeLegacyBrandValue(optional("PARASWAP_PARTNER", "swapassistant")),
  ODOS_BASE_URL: optional("ODOS_BASE_URL", "https://api.odos.xyz"),
  ODOS_API_KEY: optional("ODOS_API_KEY", ""),
  LIFI_BASE_URL: optional("LIFI_BASE_URL", "https://li.quest"),
  LIFI_API_KEY: optional("LIFI_API_KEY", ""),
  LIFI_INTEGRATOR: optional("LIFI_INTEGRATOR", ""),
  LIFI_REQUEST_BUDGET_WINDOW_MS: optionalNumber("LIFI_REQUEST_BUDGET_WINDOW_MS", 60_000),
  LIFI_REQUEST_BUDGET_MAX: optionalNumber("LIFI_REQUEST_BUDGET_MAX", 100),
  AFFILIATE_ADDRESS: optional("AFFILIATE_ADDRESS", "0x0000000000000000000000000000000000000000"),
  FEE_RECIPIENT_ADDRESS: optional("FEE_RECIPIENT_ADDRESS", ""),
  PLATFORM_FEE_BPS: optionalNumber("PLATFORM_FEE_BPS", 20),
  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", "http://localhost:3000"),
  REQUIRE_ALLOWED_ORIGIN: optionalBoolean("REQUIRE_ALLOWED_ORIGIN", false),
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 30),
  UPSTASH_REDIS_REST_URL: redisRest.url,
  UPSTASH_REDIS_REST_TOKEN: redisRest.token,
  RATE_LIMIT_REDIS_PREFIX: optional("RATE_LIMIT_REDIS_PREFIX", "wallet"),
  RATE_LIMIT_REDIS_FAIL_OPEN: optionalBoolean("RATE_LIMIT_REDIS_FAIL_OPEN", false),
  RATE_LIMIT_REDIS_REQUIRED: optionalBoolean("RATE_LIMIT_REDIS_REQUIRED", false),
  RATE_LIMIT_KEY_PEPPER: optional("RATE_LIMIT_KEY_PEPPER", ""),
  QUOTE_CACHE_TTL_MS: optionalNumber("QUOTE_CACHE_TTL_MS", 8_000),
  QUOTE_CACHE_MAX_ENTRIES: optionalNumber("QUOTE_CACHE_MAX_ENTRIES", 2_000)
};
