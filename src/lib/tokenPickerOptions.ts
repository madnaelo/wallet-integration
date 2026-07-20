import type { TokenPickerNetwork, TokenPickerOption } from "@/components/TokenPicker";
import { getSwapChainById } from "@/lib/chains";
import { NATIVE_BITCOIN_TOKEN_ADDRESS, NATIVE_SOLANA_TOKEN_ADDRESS } from "@/lib/ecosystems";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";

type ChainLike = {
  chainId: number;
  name: string;
  networkId?: string;
};

export function buildFallbackTokensByChain(chainIds: number[]): Record<number, TokenInfo[]> {
  return Object.fromEntries(chainIds.map((chainId) => [chainId, fallbackTokensForChain(chainId)]));
}

export function buildTokenPickerOptions(
  chains: ChainLike[],
  tokensByChain: Record<number, TokenInfo[]>
): TokenPickerOption[] {
  const optionsByKey = new Map<string, TokenPickerOption>();

  for (const chain of chains) {
    const chainTokens = tokensByChain[chain.chainId] ?? fallbackTokensForChain(chain.chainId);
    for (const token of chainTokens) {
      const networkId = getTokenNetworkId(token, chain);
      const key = `${networkId}:${normalizeTokenKey(token.address)}`;
      const existing = optionsByKey.get(key);
      if (existing) {
        const currentSupportedChainIds = existing.supportedQuoteChainIds ?? [];
        if (!currentSupportedChainIds.includes(chain.chainId)) {
          existing.supportedQuoteChainIds = [...currentSupportedChainIds, chain.chainId];
        }
        continue;
      }

      optionsByKey.set(key, {
        ...token,
        networkId,
        networkName: getTokenNetworkName(token, chain.name),
        quoteChainId: chain.chainId,
        supportedQuoteChainIds: [chain.chainId]
      });
    }
  }

  return [...optionsByKey.values()];
}

function fallbackTokensForChain(chainId: number): TokenInfo[] {
  const curated = DEFAULT_TOKENS_BY_CHAIN[chainId];
  if (curated?.length) return curated;
  const chain = getSwapChainById(chainId);
  const nativeCurrency = chain?.nativeCurrency;
  return nativeCurrency ? [{
    address: chain?.addressFamily === "bitcoin"
      ? NATIVE_BITCOIN_TOKEN_ADDRESS
      : chain?.addressFamily === "solana"
        ? NATIVE_SOLANA_TOKEN_ADDRESS
        : "ETH",
    symbol: nativeCurrency.symbol,
    decimals: nativeCurrency.decimals,
    name: nativeCurrency.name,
    isNative: true,
    addressFamily: chain?.addressFamily,
    walletNamespace: chain?.walletNamespace,
    networkId: chain?.networkId,
    networkName: chain?.name
  }] : [];
}

export function buildTokenPickerNetworks(
  chains: ChainLike[],
  tokens: TokenPickerOption[]
): TokenPickerNetwork[] {
  const networks = new Map<string, TokenPickerNetwork>();

  for (const chain of chains) {
    const networkId = chain.networkId ?? getEvmNetworkId(chain.chainId);
    networks.set(networkId, {
      id: networkId,
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

function getTokenNetworkId(token: TokenInfo | undefined, chain: ChainLike): string {
  return token?.networkId ?? chain.networkId ?? getEvmNetworkId(chain.chainId);
}

function getTokenNetworkName(token: TokenInfo | undefined, fallbackNetworkName: string | undefined): string {
  return token?.networkName ?? fallbackNetworkName ?? "this network";
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}
