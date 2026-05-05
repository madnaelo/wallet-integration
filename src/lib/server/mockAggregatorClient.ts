import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";

export class MockAggregatorClient implements DexAggregatorClient {
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const buyAmount = quoteBuyAmount(params.sellAmount);
    const minBuyAmount = quoteMinBuyAmount(buyAmount, params.slippageBps ?? 100);

    return {
      price: "1",
      buyAmount,
      minBuyAmount,
      sellAmount: params.sellAmount,
      to: params.takerAddress,
      data: "0x",
      value: "0",
      gas: "21000",
      allowanceTarget: params.takerAddress,
      provider: "mock",
      chainId: params.chainId,
      sellToken: params.sellToken,
      buyToken: params.buyToken
    };
  }
}

function quoteBuyAmount(sellAmount: string): string {
  try {
    return (BigInt(sellAmount) * 99n / 100n).toString();
  } catch {
    return sellAmount;
  }
}

function quoteMinBuyAmount(buyAmount: string, slippageBps: number): string {
  try {
    const safeBps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps))));
    return ((BigInt(buyAmount) * (10_000n - safeBps)) / 10_000n).toString();
  } catch {
    return buyAmount;
  }
}
