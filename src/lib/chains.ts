import { envPublic } from "@/lib/envPublic";

export type ChainConfig = {
  chainId: number;
  name: string;
  zeroXBaseUrl: string;
  rpcUrls?: string[];
  blockExplorerUrls?: string[];
  nativeCurrency?: { name: string; symbol: string; decimals: number };
};

export const SAME_CHAIN_QUOTE_CHAIN_IDS = [1, 137, 8453, 42161, 10, 56, 43114] as const;

export const CHAINS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum Mainnet",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://rpc.ankr.com/eth"],
    blockExplorerUrls: ["https://etherscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
  },
  11155111: {
    chainId: 11155111,
    name: "Sepolia",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 }
  },
  137: {
    chainId: 137,
    name: "Polygon",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://polygon-rpc.com"],
    blockExplorerUrls: ["https://polygonscan.com"],
    nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 }
  },
  8453: {
    chainId: 8453,
    name: "Base",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://mainnet.base.org"],
    blockExplorerUrls: ["https://basescan.org"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    blockExplorerUrls: ["https://arbiscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
  },
  10: {
    chainId: 10,
    name: "Optimism",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://mainnet.optimism.io"],
    blockExplorerUrls: ["https://optimistic.etherscan.io"],
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }
  },
  56: {
    chainId: 56,
    name: "BNB Smart Chain",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://bsc-dataseed.binance.org"],
    blockExplorerUrls: ["https://bscscan.com"],
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }
  },
  43114: {
    chainId: 43114,
    name: "Avalanche C-Chain",
    zeroXBaseUrl: "https://api.0x.org",
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
    blockExplorerUrls: ["https://snowtrace.io"],
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }
  }
};

export function getAllowedChainIds(): number[] {
  const raw = envPublic.ALLOWED_CHAIN_IDS;
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
