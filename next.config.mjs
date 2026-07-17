const isDevelopment = process.env.NODE_ENV !== "production";
const backendProxyTarget = normalizeBackendProxyTarget(process.env.BACKEND_PROXY_TARGET);

if (process.env.VERCEL_ENV === "production") {
  const publicBackendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "").trim();
  const redisRequired = readBoolean(process.env.RATE_LIMIT_REDIS_REQUIRED, true);
  const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
  const rateLimitPepper = (process.env.RATE_LIMIT_KEY_PEPPER ?? "").trim();
  const corsOrigins = (process.env.CORS_ALLOW_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const feeBps = Number(process.env.PLATFORM_FEE_BPS ?? "0");
  const feeRecipient = (
    process.env.FEE_RECIPIENT_ADDRESS ??
    process.env.AFFILIATE_ADDRESS ??
    ""
  ).trim();

  if (!backendProxyTarget) {
    throw new Error("BACKEND_PROXY_TARGET is required for a production Vercel build.");
  }
  if (publicBackendBaseUrl !== "/backend") {
    throw new Error("NEXT_PUBLIC_BACKEND_BASE_URL must be /backend in production.");
  }
  if (!redisRequired) {
    throw new Error("RATE_LIMIT_REDIS_REQUIRED must be true in production.");
  }
  if (redisRequired && !redisConfigured) {
    throw new Error("Production distributed rate limiting requires the Upstash Redis REST URL and token.");
  }
  if (redisConfigured) {
    assertHttpsOrigin(process.env.UPSTASH_REDIS_REST_URL, "UPSTASH_REDIS_REST_URL");
    if (isWeakConfiguredValue(process.env.UPSTASH_REDIS_REST_TOKEN, 20)) {
      throw new Error("UPSTASH_REDIS_REST_TOKEN must be a non-placeholder production secret.");
    }
  }
  if (readBoolean(process.env.RATE_LIMIT_REDIS_FAIL_OPEN, false)) {
    throw new Error("RATE_LIMIT_REDIS_FAIL_OPEN must be false in production.");
  }
  if (isWeakConfiguredValue(rateLimitPepper, 32)) {
    throw new Error("RATE_LIMIT_KEY_PEPPER must be a non-placeholder secret of at least 32 characters.");
  }
  if (!readBoolean(process.env.REQUIRE_ALLOWED_ORIGIN, false)) {
    throw new Error("REQUIRE_ALLOWED_ORIGIN must be true in production.");
  }
  if (!corsOrigins.length || corsOrigins.some((origin) => !isExplicitHttpsOrigin(origin))) {
    throw new Error("CORS_ALLOW_ORIGINS must contain only explicit production HTTPS origins.");
  }
  assertHttpsOrigin(process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 300) {
    throw new Error("PLATFORM_FEE_BPS must be an integer between 0 and 300.");
  }
  if (feeBps > 0 && (!isEvmAddress(feeRecipient) || /^0x0{40}$/i.test(feeRecipient))) {
    throw new Error("A non-zero FEE_RECIPIENT_ADDRESS is required when production platform fees are enabled.");
  }
}

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' 'report-sample'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:8080 https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" }
].concat(
  isDevelopment
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    if (!backendProxyTarget) return [];
    return [
      {
        source: "/backend/:path*",
        destination: `${backendProxyTarget}/:path*`
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;

function normalizeBackendProxyTarget(value) {
  const raw = value?.trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("BACKEND_PROXY_TARGET must be an HTTP(S) origin without credentials, query, or fragment.");
  }
  if (!isDevelopment && url.protocol !== "https:") {
    throw new Error("BACKEND_PROXY_TARGET must use HTTPS outside development.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function readBoolean(value, fallback) {
  if (!value?.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function assertHttpsOrigin(value, name) {
  if (!isExplicitHttpsOrigin((value ?? "").trim())) {
    throw new Error(`${name} must be an explicit HTTPS origin in production.`);
  }
}

function isExplicitHttpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (url.pathname === "" || url.pathname === "/")
      && !["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isWeakConfiguredValue(value, minimumLength) {
  const text = (value ?? "").trim();
  if (text.length < minimumLength) return true;
  const normalized = text.toLowerCase();
  return ["change_me", "changeme", "replace_me", "replace-me", "placeholder"].some((marker) =>
    normalized.includes(marker)
  ) || normalized.startsWith("your_") || normalized.startsWith("your-");
}

function isEvmAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
