import { env } from "@/lib/server/env";
import { createHash } from "crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = { allowed: boolean; retryAfterMs: number };

type RedisResponse = {
  result?: unknown;
  error?: string;
};

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

export async function rateLimit(key: string): Promise<RateLimitDecision> {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await redisRateLimit(key);
    } catch (error) {
      if (!env.RATE_LIMIT_REDIS_FAIL_OPEN) {
        return { allowed: false, retryAfterMs: env.RATE_LIMIT_WINDOW_MS };
      }
      console.error("[rate-limit] Redis limiter failed; falling back to memory", error);
    }
  }
  return memoryRateLimit(key);
}

function memoryRateLimit(key: string): RateLimitDecision {
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const max = env.RATE_LIMIT_MAX;
  sweepExpiredBuckets(now);

  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
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
  const windowMs = Math.max(1_000, env.RATE_LIMIT_WINDOW_MS);
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const max = Math.max(1, env.RATE_LIMIT_MAX);
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
    cache: "no-store"
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
  return createHash("sha256").update(key).digest("hex");
}

function sweepExpiredBuckets(now: number) {
  if (buckets.size < 1_000 && now - lastSweepAt < 60_000) return;
  lastSweepAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}
