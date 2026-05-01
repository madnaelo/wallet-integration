import { env } from "@/lib/server/env";
import type { DexAggregatorClient } from "@/lib/server/aggregator";
import type { ChainConfig } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import { MockAggregatorClient } from "@/lib/server/mockAggregatorClient";
import { ZeroXClient } from "@/lib/server/zeroxClient";

export function createQuoteClient(chain: ChainConfig): DexAggregatorClient {
  if (!hasZeroXApiKey(env.ZEROX_API_KEY)) {
    if (!envPublic.DISALLOW_MAINNET) {
      throw new Error("ZEROX_API_KEY is required when live execution is enabled.");
    }
    return new MockAggregatorClient();
  }

  return new ZeroXClient({
    apiKey: env.ZEROX_API_KEY,
    baseUrl: chain.zeroXBaseUrl,
    affiliateAddress: env.AFFILIATE_ADDRESS,
    buyTokenPercentageFee: 0.002
  });
}

function hasZeroXApiKey(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "your_0x_api_key_here";
}
