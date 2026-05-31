import type { TokenPickerNetwork, TokenPickerOption } from "@/components/TokenPicker";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";

type ChainLike = {
  chainId: number;
  name: string;
};

export function buildFallbackTokensByChain(chainIds: number[]): Record<number, TokenInfo[]> {
  return Object.fromEntries(chainIds.map((chainId) => [chainId, DEFAULT_TOKENS_BY_CHAIN[chainId] ?? []]));
}

export function buildTokenPickerOptions(
  chains: ChainLike[],
  tokensByChain: Record<number, TokenInfo[]>
): TokenPickerOption[] {
  const optionsByKey = new Map<string, TokenPickerOption>();

  for (const chain of chains) {
    const chainTokens = tokensByChain[chain.chainId] ?? DEFAULT_TOKENS_BY_CHAIN[chain.chainId] ?? [];
    for (const token of chainTokens) {
      const networkId = getTokenNetworkId(token, chain.chainId);
      const key = `${networkId}:${normalizeTokenKey(token.address)}`;
      const existing = optionsByKey.get(key);
      if (existing) {
        const currentSupportedChainIds = existing.supportedQuoteChainIds ?? [];
        if (!currentSupportedChainIds.includes(chain.chainId)) {
          existing.supportedQuoteChainIds = [...currentSupportedChainIds, chain.chainId];
        }
        continue;
      }

      const walletNamespace = getTokenWalletNamespace(token);
      optionsByKey.set(key, {
        ...token,
        networkId,
        networkName: getTokenNetworkName(token, chain.name),
        quoteChainId: walletNamespace === "eip155" ? chain.chainId : undefined,
        supportedQuoteChainIds: [chain.chainId]
      });
    }
  }

  return [...optionsByKey.values()];
}

export function buildTokenPickerNetworks(
  chains: ChainLike[],
  tokens: TokenPickerOption[]
): TokenPickerNetwork[] {
  const networks = new Map<string, TokenPickerNetwork>();

  for (const chain of chains) {
    networks.set(getEvmNetworkId(chain.chainId), {
      id: getEvmNetworkId(chain.chainId),
      name: chain.name
    });
  }

  for (const token of tokens) {
    if (!networks.has(token.networkId)) {
      networks.set(token.networkId, {
        id: token.networkId,
        name: token.networkName
      });
    }
  }

  return [...networks.values()];
}

export function getEvmNetworkId(chainId: number): string {
  return `eip155:${chainId}`;
}

function getTokenNetworkId(token: TokenInfo | undefined, fallbackChainId: number): string {
  return token?.networkId ?? getEvmNetworkId(fallbackChainId);
}

function getTokenNetworkName(token: TokenInfo | undefined, fallbackNetworkName: string | undefined): string {
  return token?.networkName ?? fallbackNetworkName ?? "this network";
}

function getTokenWalletNamespace(token: TokenInfo | undefined): "eip155" | "bip122" {
  if (token?.walletNamespace) return token.walletNamespace;
  return token?.addressFamily === "bitcoin" || token?.assetKind === "bitcoin" ? "bip122" : "eip155";
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}
