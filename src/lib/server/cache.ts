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
    this.pruneIfNeeded();
    this.map.set(key, { value, expiresAt: Date.now() + ttl });
  }

  private pruneIfNeeded() {
    const maxEntries = Math.max(100, env.QUOTE_CACHE_MAX_ENTRIES);
    if (this.map.size < maxEntries) return;

    const now = Date.now();
    for (const [key, entry] of this.map.entries()) {
      if (now >= entry.expiresAt) this.map.delete(key);
    }

    while (this.map.size >= maxEntries) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.map.delete(oldestKey);
    }
  }
}

export const quoteCache = new MemoryCache<QuoteResponse>();
