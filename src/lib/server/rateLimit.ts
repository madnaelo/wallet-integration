import { env } from "@/lib/server/env";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const max = env.RATE_LIMIT_MAX;

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
