import { describe, expect, it } from "vitest";

import {
  CONFIRMED_SWAP_PROVIDERS,
  DEFAULT_MONETIZED_SWAP_PROVIDERS,
  DEFAULT_SWAP_PROVIDERS,
  parseSwapProviderList,
  resolveEnabledSwapProviders,
  resolveMonetizedSwapProviders,
  resolveSwapProviderPolicy,
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
    expect(CONFIRMED_SWAP_PROVIDERS).toEqual(["0x", "lifi"]);
    expect(DEFAULT_SWAP_PROVIDERS).toEqual(["0x", "lifi"]);
    expect(DEFAULT_MONETIZED_SWAP_PROVIDERS).toEqual(["0x", "lifi"]);
    expect(resolveEnabledSwapProviders("")).toEqual(["0x", "lifi"]);
    expect(Array.from(resolveMonetizedSwapProviders(""))).toEqual(["0x", "lifi"]);
  });

  it.each(["1inch", "paraswap", "odos"])(
    "excludes %s from live routing while its fee terms are pending",
    (provider) => {
      expect(() => resolveEnabledSwapProviders(`0x,${provider}`)).toThrow(
        new RegExp(`without confirmed fee terms: ${provider}`, "i")
      );
    }
  );

  it("requires every routed provider to collect the configured platform fee", () => {
    expect(resolveSwapProviderPolicy("0x,lifi", "0x,lifi").enabled).toEqual(["0x", "lifi"]);
    expect(() => resolveSwapProviderPolicy("0x,lifi", "0x")).toThrow(/missing: lifi/i);
    expect(() => resolveSwapProviderPolicy("0x", "0x,lifi")).toThrow(/disabled providers: lifi/i);
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
