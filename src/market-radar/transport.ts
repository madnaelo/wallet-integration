import WebSocket from "ws";
import { ReconstructedBook } from "./book";
import {
  binanceSnapshot,
  ENDPOINTS,
  normalizeMessage,
  subscription,
} from "./adapters";
import type { RadarConfig } from "./config";
import type {
  MarketInstrument,
  OrderBookDelta,
  Trade,
  VenueMarketState,
  Venue,
} from "./types";

export class RadarMetrics {
  reconnects = 0;
  resyncs = 0;
  sequenceGaps = 0;
  malformedFrames = 0;
  staleBooks = 0;
  updates = 0;
  rateLimited = 0;
  zones = 0;
  unreliableWalls = 0;
  calculations = 0;
  computeTotalMs = 0;
  computeMaxMs = 0;
  apiRequests = 0;
  apiTotalMs = 0;
  connections = 0;
  lastDiscoveryError = "";
  persistenceFailures = 0;
  calculationFailures = 0;
  snapshot() {
    return { ...this };
  }
}

export class VenueRequestBudget {
  private lastRequest = 0;
  private blockedUntil = 0;
  private pending = 0;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly intervalMs = 1000,
    private readonly onRateLimit: () => void = () => undefined,
  ) {}
  get(origin: string, path: string): Promise<unknown> {
    if (this.pending >= 64)
      return Promise.reject(new Error("REST request queue full"));
    this.pending++;
    const request = this.chain
      .catch(() => undefined)
      .then(async () => {
        if (Date.now() < this.blockedUntil)
          throw new Error("Venue cooldown active");
        const delay = this.lastRequest + this.intervalMs - Date.now();
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
        this.lastRequest = Date.now();
        const response = await this.fetcher(new URL(path, origin), {
          signal: AbortSignal.timeout(10000),
          redirect: "error",
          headers: {
            "User-Agent":
              "SwapAssistant-MarketRadar/1.0 (internal market research)",
          },
        });
        if (response.status === 429 || response.status === 418) {
          this.onRateLimit();
          const retry = response.headers.get("retry-after");
          const seconds = Number(retry);
          const until = Number.isFinite(seconds)
            ? Date.now() + seconds * 1000
            : Date.parse(retry ?? "");
          this.blockedUntil = Math.max(
            Date.now() + 60000,
            Number.isFinite(until) ? until : 0,
          );
          await response.body?.cancel();
          throw new Error("Venue rate limit; collection paused");
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`Venue returned HTTP ${response.status}`);
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty venue response");
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 8 * 1024 * 1024)
              throw new Error("Oversized venue response");
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      })
      .finally(() => {
        this.pending--;
      });
    this.chain = request;
    return request;
  }
}

export class ConnectionBudget {
  private attempts: number[] = [];
  constructor(private readonly perMinute: number) {}
  reserve(now: number): boolean {
    this.attempts = this.attempts.filter((t) => t > now - 60000);
    if (this.attempts.length >= this.perMinute) return false;
    this.attempts.push(now);
    return true;
  }
}
export function reconnectDelay(
  attempt: number,
  maxMs: number,
  random = Math.random,
): number {
  return (
    Math.min(maxMs, 1000 * 2 ** Math.min(10, Math.max(0, attempt))) *
    (0.75 + random() * 0.25)
  );
}

export interface FeedTransport {
  connect(venue: Venue, maximumBytes: number): WebSocket;
  snapshot(instrument: MarketInstrument): Promise<unknown>;
}
export function exchangeTransport(
  budgets: Record<Venue, VenueRequestBudget>,
): FeedTransport {
  return {
    connect: (venue, maximumBytes) =>
      new WebSocket(ENDPOINTS[venue].websocket, {
        maxPayload: maximumBytes,
        handshakeTimeout: 10000,
        perMessageDeflate: false,
        followRedirects: false,
      }),
    snapshot: (instrument) =>
      budgets.binance.get(
        ENDPOINTS.binance.rest,
        `/api/v3/depth?symbol=${encodeURIComponent(instrument.symbol)}&limit=1000`,
      ),
  };
}

export class VenueFeed {
  readonly book: ReconstructedBook;
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private generation = 0;
  private startedAt = 0;
  private tradeHistoryStartedAt = 0;
  private lastMessage = 0;
  private openedAt = 0;
  private retryAt = 0;
  private attempt = 0;
  private nextPing = 0;
  private syncing = false;
  private buffered: OrderBookDelta[] = [];
  private trades: Trade[] = [];
  private tradeIds = new Set<string>();
  private reason = "Waiting for snapshot";
  constructor(
    readonly instrument: MarketInstrument,
    private readonly config: RadarConfig,
    private readonly transport: FeedTransport,
    private readonly budget: ConnectionBudget,
    readonly metrics: RadarMetrics,
  ) {
    this.book = new ReconstructedBook(instrument.venue);
  }
  start() {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => this.tick(), 1000);
    this.tick();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
    this.disconnect("Inactive");
  }
  private disconnect(reason: string) {
    this.generation++;
    this.reason = reason;
    this.book.invalidate();
    this.buffered = [];
    this.syncing = false;
    this.trades = [];
    this.tradeIds.clear();
    if (this.socket) {
      this.metrics.connections = Math.max(0, this.metrics.connections - 1);
      this.socket.removeAllListeners();
      this.socket.on("error", () => undefined);
      this.socket.terminate();
      this.socket = undefined;
    }
  }
  private fail(reason: string) {
    this.disconnect(reason);
    this.metrics.resyncs++;
    this.attempt++;
    this.retryAt =
      Date.now() +
      reconnectDelay(this.attempt, this.config.maxReconnectDelayMs);
  }
  tick(now = Date.now()) {
    if (this.stopped) return;
    if (!this.socket) {
      if (now < this.retryAt || !this.budget.reserve(now)) return;
      this.open();
      return;
    }
    if (
      now - this.lastMessage > this.config.staleMs ||
      (this.book.synchronized &&
        now - this.book.observedAt > this.config.staleMs)
    ) {
      this.metrics.staleBooks++;
      this.fail("Stale market feed");
      return;
    }
    // Periodic snapshots bound undetectable Bybit discontinuities; its IDs are not documented as consecutive.
    if (this.instrument.venue === "bybit" && now - this.openedAt > 300000) {
      this.fail("Periodic snapshot refresh");
      return;
    }
    if (now >= this.nextPing && this.socket.readyState === WebSocket.OPEN) {
      if (this.instrument.venue === "bybit")
        this.socket.send(JSON.stringify({ op: "ping" }));
      else if (this.instrument.venue === "okx") this.socket.send("ping");
      this.nextPing = now + 10000;
    }
  }
  private open() {
    const now = Date.now();
    this.lastMessage = now;
    this.openedAt = now;
    this.nextPing = now + 10000;
    this.startedAt = now;
    this.tradeHistoryStartedAt = now;
    const generation = ++this.generation;
    try {
      this.socket = this.transport.connect(
        this.instrument.venue,
        this.config.maxFrameBytes,
      );
    } catch {
      this.fail("Connection unavailable");
      return;
    }
    this.metrics.connections++;
    this.metrics.reconnects++;
    this.socket.on("open", () => {
      if (generation !== this.generation) return;
      this.socket!.send(
        JSON.stringify(subscription(this.instrument.venue, this.instrument)),
      );
      if (this.instrument.venue === "binance") {
        this.syncing = true;
        void this.transport
          .snapshot(this.instrument)
          .then((value) => {
            if (generation !== this.generation) return;
            this.book.apply(binanceSnapshot(value, Date.now()));
            for (const delta of this.buffered) this.book.apply(delta);
            this.buffered = [];
            this.syncing = false;
            this.reason = "";
          })
          .catch(() => {
            if (generation === this.generation)
              this.fail("Snapshot synchronization failed");
          });
      }
    });
    this.socket.on("ping", () => {
      this.lastMessage = Date.now();
    });
    this.socket.on("message", (bytes: Buffer, isBinary: boolean) => {
      if (generation !== this.generation) return;
      try {
        if (isBinary || bytes.toString().length > this.config.maxFrameBytes)
          throw new Error("Invalid frame");
        const text = bytes.toString();
        const raw: unknown = text === "pong" ? text : JSON.parse(text);
        const messages = normalizeMessage(
          this.instrument.venue,
          raw,
          this.instrument,
        );
        this.lastMessage = Date.now();
        this.metrics.updates++;
        for (const message of messages) {
          if (message.book) {
            if (
              message.book.observedAt > Date.now() + 2000 ||
              Date.now() - message.book.observedAt > this.config.staleMs
            )
              throw new Error("Invalid feed timestamp");
            if (this.syncing && message.book.kind === "delta") {
              if (this.buffered.length >= this.config.maxBufferedDeltas)
                throw new Error("Snapshot buffer exhausted");
              this.buffered.push(message.book);
            } else {
              this.book.apply(message.book);
              this.reason = "";
            }
            if (Date.now() - this.openedAt > 60000) this.attempt = 0;
          }
          for (const trade of message.trades ?? []) {
            if (
              trade.observedAt > Date.now() + 2000 ||
              trade.observedAt < Date.now() - this.config.historyMs ||
              this.tradeIds.has(trade.id)
            )
              continue;
            this.trades.push(trade);
            this.tradeIds.add(trade.id);
          }
          while (
            this.trades.length > this.config.maxTrades ||
            this.trades[0]?.observedAt < Date.now() - this.config.historyMs
          ) {
            const removed = this.trades.shift();
            if (removed) {
              this.tradeIds.delete(removed.id);
              this.tradeHistoryStartedAt = Math.max(
                this.tradeHistoryStartedAt,
                removed.observedAt,
              );
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && /gap|order/.test(error.message))
          this.metrics.sequenceGaps++;
        else this.metrics.malformedFrames++;
        this.fail("Market feed resynchronizing");
      }
    });
    this.socket.on("error", () => {
      if (generation === this.generation) this.fail("Connection unavailable");
    });
    this.socket.on("close", () => {
      if (generation === this.generation) this.fail("Connection closed");
    });
  }
  state(now = Date.now()): VenueMarketState {
    return {
      instrument: this.instrument,
      observedAt: this.book.observedAt,
      healthy:
        this.book.synchronized &&
        !this.syncing &&
        now - this.book.observedAt <= this.config.staleMs,
      reason: this.reason,
      continuity:
        this.instrument.venue === "bybit" ? "TRANSPORT_ONLY" : "VERIFIED",
      ...this.book.view(this.config.depth),
      trades: this.trades,
      historyStartedAt: this.startedAt,
      tradeHistoryStartedAt: this.tradeHistoryStartedAt,
    };
  }
}
