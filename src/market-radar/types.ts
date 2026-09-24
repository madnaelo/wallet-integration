export type Venue = "binance" | "bybit" | "okx";
export type MarketType = "SPOT" | "PERPETUAL";
export type Coverage =
  | "STRONG_COVERAGE"
  | "NORMAL_COVERAGE"
  | "LIMITED_COVERAGE"
  | "INSUFFICIENT_DATA";
export type Lifecycle =
  | "FORMING"
  | "ACTIVE"
  | "STRENGTHENING"
  | "WEAKENING"
  | "UNDER_TEST"
  | "ABSORBING"
  | "BROKEN"
  | "STALE";
export type ZoneType = "SUPPLY" | "DEMAND";

export interface MarketInstrument {
  venue: Venue;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketType: MarketType;
  priceTick: number;
  quoteVolume24h: number;
  bestBid: number;
  bestAsk: number;
  discoveredAt: number;
}

export type PriceLevel = readonly [price: string, quantity: string];
export interface OrderBookSnapshot {
  kind: "snapshot";
  sequence: number;
  crossSequence?: number;
  observedAt: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}
export interface OrderBookDelta {
  kind: "delta";
  sequence: number;
  firstSequence?: number;
  previousSequence?: number;
  crossSequence?: number;
  observedAt: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
}
export interface Trade {
  id: string;
  observedAt: number;
  price: number;
  quantity: number;
  aggressor: "BUY" | "SELL" | "UNKNOWN";
}
export interface DerivativesContext {
  observedAt: number;
  fundingRate?: number;
  openInterestBase?: number;
  actualLiquidatedBuyNotional?: number;
  actualLiquidatedSellNotional?: number;
}
export interface VenueMarketState {
  instrument: MarketInstrument;
  observedAt: number;
  healthy: boolean;
  reason: string;
  continuity: "VERIFIED" | "TRANSPORT_ONLY";
  bids: PriceLevel[];
  asks: PriceLevel[];
  trades: Trade[];
  historyStartedAt: number;
  tradeHistoryStartedAt?: number;
  derivatives?: DerivativesContext;
}
export interface SignalEvidence {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
}
export interface LiquidityZone {
  id: string;
  type: ZoneType;
  lower: number;
  upper: number;
  strength: number;
  lifecycle: Lifecycle;
  persistenceMs: number;
  notional: number;
  notionalTrend: "INCREASING" | "DECREASING" | "STABLE";
  wallReliability: number;
  absorption: "NOT_ENOUGH_TRADES" | "LOW" | "REPLENISHING" | "BEING_CONSUMED";
  aggressiveBuyNotional: number;
  aggressiveSellNotional: number;
  venues: { venue: Venue; weight: number; notional: number }[];
  evidence: SignalEvidence[];
  scoreFactors: { maturity: number; reliability: number };
  observedAt: number;
  firstObservedAt: number;
  scoreHistory: { at: number; score: number }[];
}
export interface MarketRadarSnapshot {
  instrument: { baseAsset: string; quoteAsset: string; marketType: MarketType };
  referencePrice: number | null;
  observedAt: number;
  freshness: "LIVE" | "STALE" | "UNAVAILABLE";
  calculatedAt: number;
  coverage: Coverage;
  reason: string;
  scoringVersion: string;
  scoringConfiguration: Readonly<
    Record<string, number | null | Readonly<Record<string, number>>>
  >;
  supplyZones: LiquidityZone[];
  demandZones: LiquidityZone[];
  previousZones: LiquidityZone[];
  venues: {
    venue: Venue | "illustrative";
    healthy: boolean;
    ageMs: number;
    reason: string;
    continuity: string;
  }[];
  cvd: {
    buyNotional: number;
    sellNotional: number;
    delta: number;
    windowMs: number;
    historyMs: number;
  };
  volumeProfile: {
    lower: number;
    upper: number;
    notional: number;
    kind: "HIGH_VOLUME" | "LOW_VOLUME" | "NORMAL";
  }[];
  priceStructure: {
    recentHigh: number | null;
    recentLow: number | null;
    historyMs: number;
    swingHighs: number[];
    swingLows: number[];
  };
  scoreMeaning: "STRUCTURAL_CONFLUENCE_NOT_PROBABILITY";
}
export interface PredictionAudit {
  id: string;
  snapshot: MarketRadarSnapshot;
  zone: LiquidityZone;
  horizonMs: number;
  scoringVersion: string;
}
export interface PriceObservation {
  at: number;
  price: number;
  zoneLifecycle?: Lifecycle;
}
export interface SignalOutcome {
  evaluationEndAt: number;
  windowAnchor: "SIGNAL" | "FIRST_CONTACT";
  status: "PENDING" | "COMPLETE" | "INCOMPLETE_DATA";
  horizonMs: number;
  entered: boolean | null;
  firstContactAt: number | null;
  brokeAt: number | null;
  weakenedBeforeBreak: boolean | null;
  maxPenetrationBps: number | null;
  maxReversalAfterContactBps: number | null;
  maxContinuationAfterBreakBps: number | null;
  favourableExcursionBps: number | null;
  adverseExcursionBps: number | null;
  samples: number;
  maximumGapMs: number;
}

export function pairKey(
  instrument: Pick<MarketInstrument, "baseAsset" | "quoteAsset" | "marketType">,
): string {
  return `${instrument.baseAsset}/${instrument.quoteAsset}/${instrument.marketType}`;
}
export function instrumentKey(instrument: MarketInstrument): string {
  return `${instrument.venue}/${pairKey(instrument)}`;
}
export function validAsset(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(value);
}
