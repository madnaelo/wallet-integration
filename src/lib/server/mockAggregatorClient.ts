import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";

export class MockAggregatorClient implements DexAggregatorClient {
  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const buyAmount = quoteBuyAmount(params.sellAmount);

    return {
      price: "1",
      buyAmount,
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
