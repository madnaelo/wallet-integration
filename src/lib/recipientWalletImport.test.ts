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
});
