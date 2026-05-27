import type { QuoteResponse } from "@/lib/types";

export type QuoteParams = {
  chainId: number;
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
};

export interface DexAggregatorClient {
  providerId: string;
  providerName: string;
  supportedChainIds?: number[];
  getQuote(params: QuoteParams): Promise<QuoteResponse>;
}
