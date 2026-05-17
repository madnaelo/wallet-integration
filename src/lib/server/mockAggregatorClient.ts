import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { normalizeQuote, toMinAmount } from "@/lib/server/quoteNormalization";

export class MockAggregatorClient implements DexAggregatorClient {
  providerId = "mock";
  providerName = "Demo quote";

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const buyAmount = quoteBuyAmount(params.sellAmount);

    return normalizeQuote(
      {
      price: "1",
      provider: "mock",
      chainId: params.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken
      },
      params,
      this,
      {
        buyAmount,
        minBuyAmount: toMinAmount(buyAmount, params.slippageBps),
        to: params.takerAddress,
        data: "0x",
        value: "0",
        gas: "21000",
        allowanceTarget: params.takerAddress,
        routeLines: [{ source: "Demo route", share: "100%" }]
      }
    );
  }
}

function quoteBuyAmount(sellAmount: string): string {
  try {
    return (BigInt(sellAmount) * 99n / 100n).toString();
  } catch {
    return sellAmount;
  }
}
