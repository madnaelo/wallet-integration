import type { QuoteResponse } from "@/lib/types";

export type QuoteParams = {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
};

export interface DexAggregatorClient {
  getQuote(params: QuoteParams): Promise<QuoteResponse>;
}
