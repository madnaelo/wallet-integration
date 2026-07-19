import { describe, expect, it } from "vitest";

import {
  DEFAULT_MONETIZED_SWAP_PROVIDERS,
  parseSwapProviderList,
  resolveMonetizedSwapProviders,
  SUPPORTED_SWAP_PROVIDERS
} from "@/lib/server/providerCommercialPolicy";

describe("provider commercial policy", () => {
  it("normalizes and deduplicates supported quote providers", () => {
    expect(parseSwapProviderList(" 0x,ODOS,0x,lifi ")).toEqual(["0x", "odos", "lifi"]);
  });

  it("rejects unknown providers", () => {
    expect(() => parseSwapProviderList("0x,unknown")).toThrow(/unsupported providers: unknown/i);
  });

  it("defaults monetization to providers with recorded confirmation", () => {
    expect(DEFAULT_MONETIZED_SWAP_PROVIDERS).toEqual(["0x", "lifi"]);
    expect(Array.from(resolveMonetizedSwapProviders(""))).toEqual(["0x", "lifi"]);
  });

  it.each(["1inch", "paraswap", "odos"])(
    "fails closed while %s monetization approval is pending",
    (provider) => {
      expect(() => resolveMonetizedSwapProviders(`0x,${provider}`)).toThrow(
        new RegExp(`without confirmed commercial approval: ${provider}`, "i")
      );
    }
  );

  it("keeps the supported-provider registry complete", () => {
    expect(SUPPORTED_SWAP_PROVIDERS).toEqual(["0x", "1inch", "paraswap", "odos", "lifi"]);
  });
});
