import { env } from "@/lib/server/env";
import type { DexAggregatorClient } from "@/lib/server/aggregator";
import type { ChainConfig } from "@/lib/chains";
import { MockAggregatorClient } from "@/lib/server/mockAggregatorClient";
import { ZeroXClient } from "@/lib/server/zeroxClient";

export function createQuoteClient(chain: ChainConfig): DexAggregatorClient {
  if (env.QUOTE_PROVIDER === "mock") {
    return new MockAggregatorClient();
  }

  if (env.QUOTE_PROVIDER !== "0x") {
    throw new Error(`Unsupported QUOTE_PROVIDER: ${env.QUOTE_PROVIDER}`);
  }

  return new ZeroXClient({
    apiKey: env.ZEROX_API_KEY,
    baseUrl: chain.zeroXBaseUrl,
    affiliateAddress: env.AFFILIATE_ADDRESS,
    buyTokenPercentageFee: 0.002
  });
}
