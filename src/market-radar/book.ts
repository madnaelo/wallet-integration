import type {
  OrderBookDelta,
  OrderBookSnapshot,
  PriceLevel,
  Venue,
} from "./types";

export class BookIntegrityError extends Error {}

function checkedLevels(levels: PriceLevel[], max: number): PriceLevel[] {
  if (!Array.isArray(levels) || levels.length > max)
    throw new BookIntegrityError("Oversized book update");
  for (const level of levels) {
    if (!Array.isArray(level) || level.length < 2)
      throw new BookIntegrityError("Malformed price level");
    const [price, quantity] = level;
    if (
      typeof price !== "string" ||
      typeof quantity !== "string" ||
      price.length > 48 ||
      quantity.length > 48 ||
      !/^\d+(\.\d+)?$/.test(price) ||
      !/^\d+(\.\d+)?$/.test(quantity) ||
      !Number.isFinite(Number(price) * Number(quantity)) ||
      Number(price) <= 0 ||
      Number(quantity) < 0
    ) {
      throw new BookIntegrityError("Invalid price or quantity");
    }
  }
  return levels;
}

// Never truncate a mutable book: losing a level would corrupt later delta reconstruction.
export class ReconstructedBook {
  private bids = new Map<number, PriceLevel>();
  private asks = new Map<number, PriceLevel>();
  private lastSequence = -1;
  private lastCrossSequence = -1;
  private at = 0;
  private ready = false;
  private bidBoundary = 0;
  private askBoundary = Infinity;
  constructor(
    readonly venue: Venue,
    readonly maxLevels = 4000,
  ) {}

  invalidate() {
    this.ready = false;
    this.bids.clear();
    this.asks.clear();
    this.lastSequence = -1;
    this.lastCrossSequence = -1;
    this.at = 0;
  }
  get observedAt() {
    return this.at;
  }
  get sequence() {
    return this.lastSequence;
  }
  get synchronized() {
    return this.ready;
  }

  apply(message: OrderBookSnapshot | OrderBookDelta): "APPLIED" | "DUPLICATE" {
    try {
      if (
        !Number.isSafeInteger(message.sequence) ||
        message.sequence < 0 ||
        !Number.isSafeInteger(message.observedAt) ||
        message.observedAt <= 0
      )
        throw new BookIntegrityError("Invalid sequence/timestamp");
      checkedLevels(message.bids, this.maxLevels);
      checkedLevels(message.asks, this.maxLevels);
      if (message.kind === "snapshot") {
        this.invalidate();
        if (message.crossSequence !== undefined) {
          if (
            !Number.isSafeInteger(message.crossSequence) ||
            message.crossSequence < 0
          )
            throw new BookIntegrityError("Invalid cross sequence");
          this.lastCrossSequence = message.crossSequence;
        }
        this.bidBoundary = Math.min(
          ...message.bids.map((level) => Number(level[0])),
        );
        this.askBoundary = Math.max(
          ...message.asks.map((level) => Number(level[0])),
        );
      } else {
        if (!this.ready) throw new BookIntegrityError("Delta before snapshot");
        if (this.venue === "binance") {
          if (message.sequence <= this.lastSequence) return "DUPLICATE";
          if (
            !Number.isSafeInteger(message.firstSequence) ||
            message.firstSequence! > this.lastSequence + 1 ||
            message.firstSequence! > message.sequence ||
            message.sequence < this.lastSequence + 1
          )
            throw new BookIntegrityError("Sequence gap");
        } else if (this.venue === "okx") {
          if (message.previousSequence !== this.lastSequence)
            throw new BookIntegrityError("Sequence gap");
          if (
            message.sequence === this.lastSequence &&
            !message.bids.length &&
            !message.asks.length
          ) {
            this.at = message.observedAt;
            return "DUPLICATE";
          }
          // OKX may reset seqId downwards, but prevSeqId must still match.
        } else {
          if (message.sequence === this.lastSequence) return "DUPLICATE";
          if (
            message.sequence < this.lastSequence ||
            !Number.isSafeInteger(message.crossSequence) ||
            message.crossSequence! < this.lastCrossSequence
          )
            throw new BookIntegrityError("Out-of-order book update");
          this.lastCrossSequence = message.crossSequence!;
        }
      }
      const applySide = (
        side: Map<number, PriceLevel>,
        levels: PriceLevel[],
      ) => {
        for (const level of levels) {
          const price = Number(level[0]);
          // Outside the initial REST snapshot the book is unknown; never promote those levels to trusted depth.
          if (
            this.venue === "binance" &&
            (side === this.bids
              ? price < this.bidBoundary
              : price > this.askBoundary)
          )
            continue;
          if (Number(level[1]) === 0) side.delete(price);
          else side.set(price, level);
        }
        if (side.size > this.maxLevels)
          throw new BookIntegrityError("Book memory bound exceeded");
      };
      applySide(this.bids, message.bids);
      applySide(this.asks, message.asks);
      const bestBid = Math.max(...this.bids.keys());
      const bestAsk = Math.min(...this.asks.keys());
      if (!this.bids.size || !this.asks.size || bestBid >= bestAsk)
        throw new BookIntegrityError("Empty or crossed book");
      if (
        this.venue === "binance" &&
        (bestBid <= this.bidBoundary || bestAsk >= this.askBoundary)
      )
        throw new BookIntegrityError("Initial snapshot boundary reached");
      this.lastSequence = message.sequence;
      this.at = message.observedAt;
      this.ready = true;
      return "APPLIED";
    } catch (error) {
      this.invalidate();
      throw error;
    }
  }

  view(depth = 200): { bids: PriceLevel[]; asks: PriceLevel[] } {
    if (!this.ready) return { bids: [], asks: [] };
    return {
      bids: [...this.bids.values()]
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .slice(0, depth),
      asks: [...this.asks.values()]
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .slice(0, depth),
    };
  }
}
