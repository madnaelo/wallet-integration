import { env } from "@/lib/server/env";
import type { DexAggregatorClient } from "@/lib/server/aggregator";
import type { ChainConfig } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import { MockAggregatorClient } from "@/lib/server/mockAggregatorClient";
import { ZeroXClient } from "@/lib/server/zeroxClient";
import { OneInchClient } from "@/lib/server/oneInchClient";
import { ParaswapClient } from "@/lib/server/paraswapClient";
import { OdosClient } from "@/lib/server/odosClient";
import { MultiQuoteProvider } from "@/lib/server/multiQuoteProvider";

export function createQuoteClient(chain: ChainConfig): DexAggregatorClient {
  const clients = createEnabledClients(chain);
  if (clients.length) return new MultiQuoteProvider(clients);

  if (!envPublic.DISALLOW_MAINNET) {
    throw new Error("At least one swap provider is required when live execution is enabled.");
  }

  return new MockAggregatorClient();
}

function hasZeroXApiKey(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== "your_0x_api_key_here";
}

function hasApiKey(value: string, placeholder: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== placeholder;
}

function createEnabledClients(chain: ChainConfig): DexAggregatorClient[] {
  const providers = env.SWAP_PROVIDERS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const clients: DexAggregatorClient[] = [];

  if (providers.includes("0x") && hasZeroXApiKey(env.ZEROX_API_KEY)) {
    clients.push(
      new ZeroXClient({
        apiKey: env.ZEROX_API_KEY,
        baseUrl: chain.zeroXBaseUrl,
        affiliateAddress: env.AFFILIATE_ADDRESS,
        buyTokenPercentageFee: 0.002
      })
    );
  }

  if (providers.includes("1inch") && hasApiKey(env.ONEINCH_API_KEY, "your_1inch_api_key_here")) {
    clients.push(new OneInchClient({ apiKey: env.ONEINCH_API_KEY }));
  }

  if (providers.includes("paraswap")) {
    clients.push(new ParaswapClient({ baseUrl: env.PARASWAP_BASE_URL }));
  }

  if (providers.includes("odos")) {
    clients.push(new OdosClient({ baseUrl: env.ODOS_BASE_URL, apiKey: env.ODOS_API_KEY }));
  }

  return clients;
}
