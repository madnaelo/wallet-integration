const isDevelopment = process.env.NODE_ENV !== "production";
const backendProxyTarget = normalizeBackendProxyTarget(process.env.BACKEND_PROXY_TARGET);

if (process.env.VERCEL_ENV === "production") {
  const publicBackendBaseUrl = (process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "").trim();
  const redisRequired = readBoolean(process.env.RATE_LIMIT_REDIS_REQUIRED, true);
  const redisConfigured = Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );

  if (!backendProxyTarget) {
    throw new Error("BACKEND_PROXY_TARGET is required for a production Vercel build.");
  }
  if (publicBackendBaseUrl && publicBackendBaseUrl !== "/backend") {
    throw new Error("NEXT_PUBLIC_BACKEND_BASE_URL must be /backend in production.");
  }
  if (redisRequired && !redisConfigured) {
    throw new Error("Production distributed rate limiting requires the Upstash Redis REST URL and token.");
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
