import { env } from "@/lib/server/env";
import type { DexAggregatorClient } from "@/lib/server/aggregator";
import type { ChainConfig } from "@/lib/chains";
import { envPublic } from "@/lib/envPublic";
import { MockAggregatorClient } from "@/lib/server/mockAggregatorClient";
import { ZeroXClient } from "@/lib/server/zeroxClient";
import { OneInchClient } from "@/lib/server/oneInchClient";
import { ParaswapClient } from "@/lib/server/paraswapClient";
import { OdosClient } from "@/lib/server/odosClient";
import { LifiBitcoinClient } from "@/lib/server/lifiBitcoinClient";
import { MultiQuoteProvider } from "@/lib/server/multiQuoteProvider";
import { createPlatformFeeConfig } from "@/lib/server/platformFees";
import {
  parseSwapProviderList,
  resolveMonetizedSwapProviders,
  type SwapProviderId
} from "@/lib/server/providerCommercialPolicy";

export function createQuoteClient(chain: ChainConfig): DexAggregatorClient {
  const clients = createEnabledClients(chain);
  if (clients.length) return new MultiQuoteProvider(clients);

  if (!envPublic.DISALLOW_MAINNET) {
    throw new Error("At least one swap provider is required when live execution is enabled.");
  }

  return new MockAggregatorClient();
}

export function createNativeBitcoinQuoteClient(): DexAggregatorClient {
  if (!enabledProviders().includes("lifi")) {
    throw new Error("Native Bitcoin quotes are unavailable right now.");
  }

  const platformFee = createPlatformFeeConfig();
  const monetizedProviders = resolveMonetizedSwapProviders(env.MONETIZED_SWAP_PROVIDERS);

  return new LifiBitcoinClient({
    baseUrl: env.LIFI_BASE_URL,
    apiKey: env.LIFI_API_KEY,
    integrator: env.LIFI_INTEGRATOR,
    platformFee: feeConfigForProvider(platformFee, "lifi", monetizedProviders)
  });
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
  const providers = enabledProviders();
  const clients: DexAggregatorClient[] = [];
  const platformFee = createPlatformFeeConfig();
  const monetizedProviders = resolveMonetizedSwapProviders(env.MONETIZED_SWAP_PROVIDERS);

  if (providers.includes("0x") && hasZeroXApiKey(env.ZEROX_API_KEY)) {
    clients.push(
      new ZeroXClient({
        apiKey: env.ZEROX_API_KEY,
        baseUrl: chain.zeroXBaseUrl,
        platformFee: feeConfigForProvider(platformFee, "0x", monetizedProviders)
      })
    );
  }

  if (providers.includes("1inch") && hasApiKey(env.ONEINCH_API_KEY, "your_1inch_api_key_here")) {
    clients.push(
      new OneInchClient({
        apiKey: env.ONEINCH_API_KEY,
        platformFee: feeConfigForProvider(platformFee, "1inch", monetizedProviders)
      })
    );
  }

  if (providers.includes("paraswap")) {
    clients.push(
      new ParaswapClient({
        baseUrl: env.PARASWAP_BASE_URL,
        apiKey: env.PARASWAP_API_KEY,
        apiKeyHeader: env.PARASWAP_API_KEY_HEADER,
        platformFee: feeConfigForProvider(platformFee, "paraswap", monetizedProviders)
      })
    );
  }

  if (providers.includes("odos")) {
    clients.push(
      new OdosClient({
        baseUrl: env.ODOS_BASE_URL,
        apiKey: env.ODOS_API_KEY,
        platformFee: feeConfigForProvider(platformFee, "odos", monetizedProviders)
      })
    );
  }

  return clients;
}

function enabledProviders(): SwapProviderId[] {
  return parseSwapProviderList(env.SWAP_PROVIDERS);
}

function feeConfigForProvider(
  platformFee: ReturnType<typeof createPlatformFeeConfig>,
  provider: SwapProviderId,
  monetizedProviders: ReadonlySet<SwapProviderId>
): ReturnType<typeof createPlatformFeeConfig> {
  return monetizedProviders.has(provider) ? platformFee : { ...platformFee, enabled: false };
}
