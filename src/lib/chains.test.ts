import { describe, expect, it } from "vitest";

import { CHAINS, MAINNET_CHAIN_IDS, ZERO_X_SWAP_CHAIN_IDS } from "@/lib/chains";

describe("reviewed chain catalog", () => {
  it("contains unique executable EVM mainnets with wallet metadata", () => {
    expect(MAINNET_CHAIN_IDS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(MAINNET_CHAIN_IDS).size).toBe(MAINNET_CHAIN_IDS.length);
    for (const chainId of MAINNET_CHAIN_IDS) {
      expect(CHAINS[chainId]).toMatchObject({
        chainId,
        zeroXBaseUrl: "https://api.0x.org"
      });
      expect(CHAINS[chainId]?.rpcUrls?.[0]).toMatch(/^https:\/\//);
      expect(CHAINS[chainId]?.nativeCurrency?.symbol).toBeTruthy();
    }
  });

  it("keeps 0x routing limited to its documented chain set", () => {
    expect(ZERO_X_SWAP_CHAIN_IDS).toHaveLength(21);
    expect(ZERO_X_SWAP_CHAIN_IDS).toEqual(expect.arrayContaining([1, 8453, 42161, 10, 137, 56]));
    expect(ZERO_X_SWAP_CHAIN_IDS.every((chainId) => MAINNET_CHAIN_IDS.includes(chainId))).toBe(true);
  });
});
