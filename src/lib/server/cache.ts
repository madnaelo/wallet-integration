import { env } from "@/lib/server/env";
import type { QuoteResponse } from "@/lib/types";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

class MemoryCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  get(key: string): T | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() >= e.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }

  set(key: string, value: T) {
    const ttl = env.QUOTE_CACHE_TTL_MS;
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
  }
}

export const quoteCache = new MemoryCache<QuoteResponse>();
