function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

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

const quoteProvider = optional("QUOTE_PROVIDER", "0x");

export const env = {
  QUOTE_PROVIDER: quoteProvider,
  ZEROX_API_KEY: quoteProvider === "0x" ? required("ZEROX_API_KEY") : optional("ZEROX_API_KEY", ""),
  AFFILIATE_ADDRESS: optional("AFFILIATE_ADDRESS", "0x0000000000000000000000000000000000000000"),
  CORS_ALLOW_ORIGINS: optional("CORS_ALLOW_ORIGINS", "http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX: optionalNumber("RATE_LIMIT_MAX", 30),
  QUOTE_CACHE_TTL_MS: optionalNumber("QUOTE_CACHE_TTL_MS", 8_000)
};
