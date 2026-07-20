import { envPublic } from "@/lib/envPublic";
import {
  NATIVE_BITCOIN_CHAIN_ID,
  NATIVE_BITCOIN_NETWORK_ID,
  SOLANA_CHAIN_ID,
  SOLANA_NETWORK_ID,
  type AddressFamily,
  type WalletNamespace
} from "@/lib/ecosystems";
import chainCatalog from "../../config/supported-evm-chains.json";

export type ChainConfig = {
  chainId: number;
  name: string;
  zeroXBaseUrl: string;
  addressFamily?: AddressFamily;
  walletNamespace?: WalletNamespace;
  networkId?: string;
  rpcUrls?: string[];
  blockExplorerUrls?: string[];
  nativeCurrency?: { name: string; symbol: string; decimals: number };
};

export const SAME_CHAIN_QUOTE_CHAIN_IDS = [1, 137, 8453, 42161, 10, 56, 43114] as const;
export const ZERO_X_SWAP_CHAIN_IDS = chainCatalog.chains
  .filter((chain) => chain.zeroXSupported)
  .map((chain) => chain.chainId);
export const MAINNET_CHAIN_IDS = chainCatalog.chains.map((chain) => chain.chainId);

export const NON_EVM_SWAP_CHAINS: Record<number, ChainConfig> = {
  [NATIVE_BITCOIN_CHAIN_ID]: {
    chainId: NATIVE_BITCOIN_CHAIN_ID,
    name: "Bitcoin",
    zeroXBaseUrl: "",
    addressFamily: "bitcoin",
    walletNamespace: "bip122",
    networkId: NATIVE_BITCOIN_NETWORK_ID,
    blockExplorerUrls: ["https://mempool.space/"],
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 8 }
  },
  [SOLANA_CHAIN_ID]: {
    chainId: SOLANA_CHAIN_ID,
    name: "Solana",
    zeroXBaseUrl: "",
    addressFamily: "solana",
    walletNamespace: "solana",
    networkId: SOLANA_NETWORK_ID,
    rpcUrls: ["https://api.mainnet-beta.solana.com"],
    blockExplorerUrls: ["https://solscan.io/"],
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 }
  }
};

export const CHAINS: Record<number, ChainConfig> = {
  ...Object.fromEntries(chainCatalog.chains.map((chain) => [
    chain.chainId,
    {
      chainId: chain.chainId,
      name: chain.name,
      zeroXBaseUrl: "https://api.0x.org",
      rpcUrls: chain.rpcUrls,
      blockExplorerUrls: chain.blockExplorerUrls,
      nativeCurrency: chain.nativeCurrency
    }
  ])),
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }
  }
};

export function getAllowedChainIds(): number[] {
  const raw = envPublic.ALLOWED_CHAIN_IDS;
  if (raw.trim().toLowerCase() === "all") return [...MAINNET_CHAIN_IDS];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isSafeInteger(n) && n > 0 && Boolean(CHAINS[n]));

  return ids.length ? ids : [11155111];
}

export function isChainAllowed(chainId: number): boolean {
  const allowed = getAllowedChainIds();
  return allowed.includes(chainId);
}

export function getAllowedChains() {
  return getAllowedChainIds()
    .map((id) => CHAINS[id])
    .filter((c): c is NonNullable<typeof c> => !!c);
}

export function getChainById(chainId: number) {
  return CHAINS[chainId];
}

export function getSwapChains(): ChainConfig[] {
  return [
    ...getAllowedChains(),
    NON_EVM_SWAP_CHAINS[SOLANA_CHAIN_ID]!,
    NON_EVM_SWAP_CHAINS[NATIVE_BITCOIN_CHAIN_ID]!
  ];
}

export function getSwapChainById(chainId: number): ChainConfig | undefined {
  return CHAINS[chainId] ?? NON_EVM_SWAP_CHAINS[chainId];
}

export function isSwapChainAllowed(chainId: number): boolean {
  return isChainAllowed(chainId) || Boolean(NON_EVM_SWAP_CHAINS[chainId]);
}
