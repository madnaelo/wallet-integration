import { env } from "@/lib/server/env";
import type { DexAggregatorClient } from "@/lib/server/aggregator";
import { getChainById } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import { MockAggregatorClient } from "@/lib/server/mockAggregatorClient";
import { ZeroXClient } from "@/lib/server/zeroxClient";
import { OneInchClient } from "@/lib/server/oneInchClient";
import { ParaswapClient } from "@/lib/server/paraswapClient";
import { OdosClient } from "@/lib/server/odosClient";
import { LifiClient } from "@/lib/server/lifiClient";
import { MultiQuoteProvider } from "@/lib/server/multiQuoteProvider";
import { createPlatformFeeConfig } from "@/lib/server/platformFees";
import {
  resolveSwapProviderPolicy,
  type SwapProviderId
} from "@/lib/server/providerCommercialPolicy";

export function createQuoteClient(fromChainId: number, toChainId = fromChainId): DexAggregatorClient {
  const clients = createEnabledClients(fromChainId, toChainId);
  if (clients.length) return new MultiQuoteProvider(clients);

  if (!envPublic.DISALLOW_MAINNET) {
    throw new Error("No confirmed swap provider supports this route right now.");
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

function createEnabledClients(fromChainId: number, toChainId: number): DexAggregatorClient[] {
  const policy = resolveSwapProviderPolicy(env.SWAP_PROVIDERS, env.MONETIZED_SWAP_PROVIDERS);
  const providers = policy.enabled;
  const clients: DexAggregatorClient[] = [];
  const platformFee = createPlatformFeeConfig();
  const sameChain = fromChainId === toChainId;
  const chain = sameChain ? getChainById(fromChainId) : undefined;

  if (chain && providers.includes("0x") && hasZeroXApiKey(env.ZEROX_API_KEY)) {
    clients.push(
      new ZeroXClient({
        apiKey: env.ZEROX_API_KEY,
        baseUrl: chain.zeroXBaseUrl,
        platformFee: feeConfigForProvider(platformFee, "0x", policy.monetized)
      })
    );
  }

  if (chain && providers.includes("1inch") && hasApiKey(env.ONEINCH_API_KEY, "your_1inch_api_key_here")) {
    clients.push(
      new OneInchClient({
        apiKey: env.ONEINCH_API_KEY,
        platformFee: feeConfigForProvider(platformFee, "1inch", policy.monetized)
      })
    );
  }

  if (chain && providers.includes("paraswap")) {
    clients.push(
      new ParaswapClient({
        baseUrl: env.PARASWAP_BASE_URL,
        apiKey: env.PARASWAP_API_KEY,
        apiKeyHeader: env.PARASWAP_API_KEY_HEADER,
        platformFee: feeConfigForProvider(platformFee, "paraswap", policy.monetized)
      })
    );
  }

  if (chain && providers.includes("odos")) {
    clients.push(
      new OdosClient({
        baseUrl: env.ODOS_BASE_URL,
        apiKey: env.ODOS_API_KEY,
        platformFee: feeConfigForProvider(platformFee, "odos", policy.monetized)
      })
    );
  }

  if (providers.includes("lifi")) {
    clients.push(
      new LifiClient({
        baseUrl: env.LIFI_BASE_URL,
        apiKey: env.LIFI_API_KEY,
        integrator: env.LIFI_INTEGRATOR,
        platformFee: feeConfigForProvider(platformFee, "lifi", policy.monetized)
      })
    );
  }

  return clients;
}

function feeConfigForProvider(
  platformFee: ReturnType<typeof createPlatformFeeConfig>,
  provider: SwapProviderId,
  monetizedProviders: ReadonlySet<SwapProviderId>
): ReturnType<typeof createPlatformFeeConfig> {
  return monetizedProviders.has(provider) ? platformFee : { ...platformFee, enabled: false };
}
