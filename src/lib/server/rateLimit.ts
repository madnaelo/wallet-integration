import { env } from "@/lib/server/env";
import { createHash } from "crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = { allowed: boolean; retryAfterMs: number; unavailable?: boolean };

type RedisResponse = {
  result?: unknown;
  error?: string;
};

const buckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 50_000;
let lastSweepAt = 0;

export async function rateLimit(key: string): Promise<RateLimitDecision> {
  const redisConfigured = hasRedisConfiguration();
  if (env.RATE_LIMIT_REDIS_REQUIRED && !redisConfigured) {
    return { allowed: false, retryAfterMs: normalizedWindowMs(), unavailable: true };
  }
  if (redisConfigured) {
    try {
      return await redisRateLimit(key);
    } catch (error) {
      if (!env.RATE_LIMIT_REDIS_FAIL_OPEN) {
        return { allowed: false, retryAfterMs: normalizedWindowMs(), unavailable: true };
      }
      console.error("[rate-limit] Redis limiter failed; falling back to memory", error);
    }
  }
  return memoryRateLimit(key);
}

function memoryRateLimit(key: string): RateLimitDecision {
  const now = Date.now();
  const windowMs = normalizedWindowMs();
  const max = normalizedMaxRequests();
  sweepExpiredBuckets(now);

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    if (!b && buckets.size >= MAX_MEMORY_BUCKETS) {
      return { allowed: false, retryAfterMs: windowMs };
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (b.count >= max) {
    return { allowed: false, retryAfterMs: Math.max(0, b.resetAt - now) };
  }

  b.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

async function redisRateLimit(key: string): Promise<RateLimitDecision> {
  const windowMs = normalizedWindowMs();
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const max = normalizedMaxRequests();
  const redisKey = `${env.RATE_LIMIT_REDIS_PREFIX}:rl:${hashKey(key)}`;

  const response = await fetch(`${env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, "")}/multi-exec`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      ["SET", redisKey, "0", "NX", "EX", ttlSeconds],
      ["INCR", redisKey],
      ["TTL", redisKey]
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(2_500)
  });

  if (!response.ok) {
    throw new Error(`Redis rate limiter returned HTTP ${response.status}`);
  }

  const payload = await response.json() as RedisResponse[];
  const failed = payload.find((item) => item.error);
  if (failed?.error) throw new Error(failed.error);

  const count = Number(payload[1]?.result);
  const ttl = Number(payload[2]?.result);
  if (!Number.isFinite(count)) throw new Error("Redis rate limiter returned invalid count");

  if (count > max) {
    const retryAfterMs = Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : windowMs;
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

function hashKey(key: string): string {
  return createHash("sha256").update(`${env.RATE_LIMIT_KEY_PEPPER}:${key}`).digest("hex");
}

export function getRateLimitReadiness() {
  const redisConfigured = hasRedisConfiguration();
  return {
    ready: !env.RATE_LIMIT_REDIS_REQUIRED || redisConfigured,
    mode: redisConfigured ? "redis" : "memory"
  };
}

function hasRedisConfiguration(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL.trim() && env.UPSTASH_REDIS_REST_TOKEN.trim());
}

function normalizedWindowMs(): number {
  return Math.max(1_000, Math.min(3_600_000, Math.round(env.RATE_LIMIT_WINDOW_MS)));
}

function normalizedMaxRequests(): number {
  return Math.max(1, Math.min(10_000, Math.round(env.RATE_LIMIT_MAX)));
}

function sweepExpiredBuckets(now: number) {
  if (buckets.size < 1_000 && now - lastSweepAt < 60_000) return;
  lastSweepAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}
