import { env } from "@/lib/server/env";
import { createHmac } from "crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = { allowed: boolean; retryAfterMs: number; unavailable?: boolean };

type RedisResponse = {
  result?: unknown;
  error?: string;
};

const RATE_LIMIT_SCRIPT = `
local max_requests = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])

for _, key in ipairs(KEYS) do
  local count = redis.call("INCR", key)
  if count == 1 then
    redis.call("PEXPIRE", key, window_ms)
  end
  if count > max_requests then
    local ttl = redis.call("PTTL", key)
    if ttl < 0 then
      ttl = window_ms
    end
    return {0, ttl}
  end
end

return {1, 0}
`;

const buckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 50_000;
let lastSweepAt = 0;

export async function rateLimit(key: string): Promise<RateLimitDecision> {
  return rateLimitMany([key]);
}

export async function rateLimitMany(keys: string[]): Promise<RateLimitDecision> {
  const uniqueKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return { allowed: false, retryAfterMs: normalizedWindowMs(), unavailable: true };
  }

  const redisConfigured = hasRedisConfiguration();
  if (env.RATE_LIMIT_REDIS_REQUIRED && !redisConfigured) {
    return { allowed: false, retryAfterMs: normalizedWindowMs(), unavailable: true };
  }
  if (redisConfigured) {
    try {
      return await redisRateLimitMany(uniqueKeys);
    } catch (error) {
      if (!env.RATE_LIMIT_REDIS_FAIL_OPEN) {
        return { allowed: false, retryAfterMs: normalizedWindowMs(), unavailable: true };
      }
      console.error({
        event: "rate_limit_redis_failed",
        fallback: "memory",
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }
  return memoryRateLimitMany(uniqueKeys);
}

function memoryRateLimitMany(keys: string[]): RateLimitDecision {
  const now = Date.now();
  const windowMs = normalizedWindowMs();
  const max = normalizedMaxRequests();
  sweepExpiredBuckets(now);

  for (const key of keys) {
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      if (!bucket && buckets.size >= MAX_MEMORY_BUCKETS) {
        return { allowed: false, retryAfterMs: windowMs };
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      continue;
    }

    if (bucket.count >= max) {
      return { allowed: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
    }
    bucket.count += 1;
  }
  return { allowed: true, retryAfterMs: 0 };
}

async function redisRateLimitMany(keys: string[]): Promise<RateLimitDecision> {
  const windowMs = normalizedWindowMs();
  const max = normalizedMaxRequests();
  const redisKeys = keys.map(
    (key) => `${env.RATE_LIMIT_REDIS_PREFIX}:rl:${hashKey(key)}`
  );

  const response = await fetch(env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      "EVAL",
      RATE_LIMIT_SCRIPT,
      redisKeys.length,
      ...redisKeys,
      max,
      windowMs
    ]),
    cache: "no-store",
    signal: AbortSignal.timeout(2_500)
  });

  if (!response.ok) {
    throw new Error(`Redis rate limiter returned HTTP ${response.status}`);
  }

  const payload = await response.json() as RedisResponse;
  if (payload.error) throw new Error(payload.error);
  if (!Array.isArray(payload.result) || payload.result.length < 2) {
    throw new Error("Redis rate limiter returned an invalid result");
  }

  const allowed = Number(payload.result[0]);
  const retryAfterMs = Number(payload.result[1]);
  if ((allowed !== 0 && allowed !== 1) || !Number.isFinite(retryAfterMs)) {
    throw new Error("Redis rate limiter returned an invalid decision");
  }
  return {
    allowed: allowed === 1,
    retryAfterMs: allowed === 1 ? 0 : Math.max(1, retryAfterMs)
  };
}

function hashKey(key: string): string {
  return createHmac("sha256", env.RATE_LIMIT_KEY_PEPPER).update(key).digest("hex");
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
