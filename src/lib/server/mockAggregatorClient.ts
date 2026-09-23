import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { normalizeQuote, toMinAmount } from "@/lib/server/quoteNormalization";

export class MockAggregatorClient implements DexAggregatorClient {
  providerId = "mock";
  providerName = "Demo quote";

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    return buildMockQuote(params);
  }
}

// Shared synthetic quote builder; never calls a provider or signs a transaction.
export function buildMockQuote(params: QuoteParams, buyAmount = quoteBuyAmount(params.sellAmount)): QuoteResponse {
  return normalizeQuote(params, { providerId: "mock", providerName: "Demo quote" }, {
    buyAmount,
    minBuyAmount: toMinAmount(buyAmount, params.slippageBps),
    to: params.takerAddress,
    data: "0x",
    value: "0",
    gas: "21000",
    allowanceTarget: params.takerAddress,
    routeLines: [{ source: "Demo route", share: "100%" }]
  });
}

function quoteBuyAmount(sellAmount: string): string {
  try {
    return (BigInt(sellAmount) * 99n / 100n).toString();
  } catch {
    return sellAmount;
  }
}
