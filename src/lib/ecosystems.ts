export type AddressFamily = "evm" | "bitcoin" | "solana";
export type WalletNamespace = "eip155" | "bip122" | "solana";

export const NATIVE_BITCOIN_CHAIN_ID = 20_000_000_000_001;
export const NATIVE_BITCOIN_NETWORK_ID = "bip122:000000000019d6689c085ae165831e93";
export const NATIVE_BITCOIN_TOKEN_ADDRESS = "bitcoin";

export const SOLANA_CHAIN_ID = 1_151_111_081_099_710;
export const SOLANA_NETWORK_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
export const NATIVE_SOLANA_TOKEN_ADDRESS = "11111111111111111111111111111111";

export function getAddressFamilyForChain(chainId: number): AddressFamily {
  if (chainId === NATIVE_BITCOIN_CHAIN_ID) return "bitcoin";
  if (chainId === SOLANA_CHAIN_ID) return "solana";
  return "evm";
}

export function getWalletNamespaceForFamily(family: AddressFamily): WalletNamespace {
  if (family === "bitcoin") return "bip122";
  if (family === "solana") return "solana";
  return "eip155";
}
