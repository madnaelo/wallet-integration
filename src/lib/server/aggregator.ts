import type { QuoteResponse } from "@/lib/types";
export type ProviderOutcome = { provider: string; outcome: "quoted" | "fee_validation_failed" | "unavailable" };

export type QuoteParams = {
  chainId: number;
  buyChainId?: number;
  sellToken: string;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  buyToken: string;
  buyTokenSymbol: string;
  buyTokenDecimals: number;
  sellAmount: string;
  takerAddress: string;
  toAddress?: string;
  slippageBps?: number;
  signal?: AbortSignal;
  onProviderOutcome?: (outcome: ProviderOutcome) => void;
};

export interface DexAggregatorClient {
  providerId: string;
  providerName: string;
  supportedChainIds?: number[];
  getQuote(params: QuoteParams): Promise<QuoteResponse>;
}
