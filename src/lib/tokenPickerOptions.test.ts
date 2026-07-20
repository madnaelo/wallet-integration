import { describe, expect, it } from "vitest";

import { getChainById, getSwapChainById } from "@/lib/chains";
import { NATIVE_BITCOIN_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/tokens";
import {
  buildFallbackTokensByChain,
  buildTokenPickerNetworks,
  buildTokenPickerOptions
} from "@/lib/tokenPickerOptions";

describe("token picker network catalog", () => {
  it("creates a native fallback for reviewed networks without curated tokens", () => {
    const chain = getChainById(59144)!;
    const tokensByChain = buildFallbackTokensByChain([chain.chainId]);

    expect(tokensByChain[chain.chainId]).toContainEqual(expect.objectContaining({
      symbol: "ETH",
      address: "ETH",
      isNative: true
    }));
  });

  it("keeps token identities separate across networks", () => {
    const chains = [getChainById(1)!, getChainById(8453)!];
    const tokensByChain = buildFallbackTokensByChain(chains.map((chain) => chain.chainId));
    const options = buildTokenPickerOptions(chains, tokensByChain);
    const networks = buildTokenPickerNetworks(chains, options);

    expect(options.filter((token) => token.address === "ETH")).toHaveLength(2);
    expect(networks.map((network) => network.id)).toEqual(["eip155:1", "eip155:8453"]);
  });

  it("adds Bitcoin and Solana as independent executable networks", () => {
    const chains = [getSwapChainById(SOLANA_CHAIN_ID)!, getSwapChainById(NATIVE_BITCOIN_CHAIN_ID)!];
    const tokensByChain = buildFallbackTokensByChain(chains.map((chain) => chain.chainId));
    const options = buildTokenPickerOptions(chains, tokensByChain);
    const networks = buildTokenPickerNetworks(chains, options);

    expect(networks.map((network) => network.name)).toEqual(["Solana", "Bitcoin"]);
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: "SOL", quoteChainId: SOLANA_CHAIN_ID, walletNamespace: "solana" }),
      expect.objectContaining({ symbol: "BTC", quoteChainId: NATIVE_BITCOIN_CHAIN_ID, walletNamespace: "bip122" })
    ]));
  });
});
