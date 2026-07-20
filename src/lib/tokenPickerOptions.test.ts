import { describe, expect, it } from "vitest";

import { getChainById } from "@/lib/chains";
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
    expect(networks.map((network) => network.id)).toEqual(["eip155:1", "eip155:8453", "bip122:bitcoin"]);
  });
});
