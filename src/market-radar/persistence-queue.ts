import { pairKey, type MarketRadarSnapshot } from "./types";

// Coalesce under database pressure. Missing intervals become INCOMPLETE_DATA, not invented outcomes.
export class PersistenceQueue {
  private pending = new Map<string, MarketRadarSnapshot>();
  private running?: Promise<void>;
  private lastAccepted = new Map<string, number>();
  private closed = false;
  dropped = 0;
  failures = 0;

  constructor(
    private readonly save: (snapshot: MarketRadarSnapshot) => Promise<void>,
    private readonly capacity = 100,
    private readonly intervalMs = 10000,
  ) {}

  offer(snapshot: MarketRadarSnapshot): boolean {
    if (this.closed) return false;
    const key = pairKey(snapshot.instrument);
    if (
      snapshot.calculatedAt - (this.lastAccepted.get(key) ?? 0) <
      this.intervalMs
    )
      return false;
    if (!this.pending.has(key) && this.pending.size >= this.capacity) {
      this.dropped++;
      return false;
    }
    this.lastAccepted.set(key, snapshot.calculatedAt);
    if (this.lastAccepted.size > this.capacity * 2)
      this.lastAccepted.delete(this.lastAccepted.keys().next().value!);
    if (this.pending.has(key)) this.dropped++;
    this.pending.set(key, snapshot);
    if (!this.running)
      this.running = this.drain().finally(() => {
        this.running = undefined;
      });
    return true;
  }

  private async drain() {
    while (this.pending.size) {
      const [key, snapshot] = this.pending.entries().next().value!;
      this.pending.delete(key);
      try {
        await this.save(snapshot);
      } catch {
        this.failures++;
      }
    }
  }

  async close() {
    this.closed = true;
    await this.running;
  }
  get size() {
    return this.pending.size;
  }
}
