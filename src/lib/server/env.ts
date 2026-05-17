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

export const env = {
  ZEROX_API_KEY: optional("ZEROX_API_KEY", ""),
  ONEINCH_API_KEY: optional("ONEINCH_API_KEY", ""),
  SWAP_PROVIDERS: optional("SWAP_PROVIDERS", "0x,1inch,paraswap,odos"),
  PARASWAP_BASE_URL: optional("PARASWAP_BASE_URL", "https://api.paraswap.io"),
  PARASWAP_API_KEY: optional("PARASWAP_API_KEY", ""),
  PARASWAP_API_KEY_HEADER: optional("PARASWAP_API_KEY_HEADER", "X-API-Key"),
  PARASWAP_PARTNER: optional("PARASWAP_PARTNER", "thewallet"),
  ODOS_BASE_URL: optional("ODOS_BASE_URL", "https://api.odos.xyz"),
  ODOS_API_KEY: optional("ODOS_API_KEY", ""),
  AFFILIATE_ADDRESS: optional("AFFILIATE_ADDRESS", "0x0000000000000000000000000000000000000000"),
  FEE_RECIPIENT_ADDRESS: optional("FEE_RECIPIENT_ADDRESS", ""),
  PLATFORM_FEE_BPS: optionalNumber("PLATFORM_FEE_BPS", 20),
  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", "http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 30),
  QUOTE_CACHE_TTL_MS: optionalNumber("QUOTE_CACHE_TTL_MS", 8_000)
};
