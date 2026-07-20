import { describe, expect, it } from "vitest";

import { recipientAddressNamespaces } from "@/lib/recipientWalletImport";

describe("recipientAddressNamespaces", () => {
  it("requests an address without transaction or signing permissions", () => {
    expect(recipientAddressNamespaces(1)).toEqual({
      eip155: {
        chains: ["eip155:1"],
        methods: [],
        events: []
      }
    });
  });

  it("rejects invalid network identifiers", () => {
    expect(() => recipientAddressNamespaces(0)).toThrow("Choose a valid network.");
  });

  it("requests Solana and Bitcoin addresses without transaction permissions", () => {
    expect(recipientAddressNamespaces(1_151_111_081_099_710, "solana"))
      .toEqual({
        solana: {
          chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
          methods: [],
          events: []
        }
      });
    expect(recipientAddressNamespaces(20_000_000_000_001, "bitcoin"))
      .toEqual({
        bip122: {
          chains: ["bip122:000000000019d6689c085ae165831e93"],
          methods: [],
          events: []
        }
      });
  });
});
