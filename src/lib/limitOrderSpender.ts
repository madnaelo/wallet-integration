import { isAddress } from "@/lib/validation";

export const COW_PROTOCOL_PROVIDER = "cow_protocol";
export const ONEINCH_ORDERBOOK_PROVIDER = "1inch_orderbook";

// CoW Protocol deploys the same GPv2VaultRelayer address on its supported networks.
const COW_VAULT_RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const COW_SUPPORTED_CHAINS = new Set([1, 56, 100, 137, 8453, 9745, 42161, 43114, 57073, 59144]);
const ONEINCH_SUPPORTED_CHAINS = new Set([1, 10, 56, 100, 130, 137, 146, 324, 8453, 42161, 43114, 59144]);

export async function resolveTrustedLimitOrderSpender(provider: string, chainId: number): Promise<string> {
  let spender: string;
  if (provider === COW_PROTOCOL_PROVIDER) {
    if (!COW_SUPPORTED_CHAINS.has(chainId)) throw new Error("CoW Protocol is not approved on this network.");
    spender = COW_VAULT_RELAYER;
  } else if (provider === ONEINCH_ORDERBOOK_PROVIDER) {
    if (!ONEINCH_SUPPORTED_CHAINS.has(chainId)) throw new Error("1inch Limit Orders is not approved on this network.");
    const { getLimitOrderContract } = await import("@1inch/limit-order-sdk");
    spender = getLimitOrderContract(chainId);
  } else {
    throw new Error("This limit order provider is not trusted for token approval.");
  }

  if (!isAddress(spender)) throw new Error("This limit order provider returned an invalid approval address.");
  return spender;
}
