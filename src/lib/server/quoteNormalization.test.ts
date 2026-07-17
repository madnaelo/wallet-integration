import { describe, expect, it } from "vitest";

import {
  getProviderErrorStatus,
  normalizeQuote,
  normalizeProviderError,
  providerError
} from "@/lib/server/quoteNormalization";

describe("quote provider errors", () => {
  it("does not expose upstream messages or credentials", () => {
    const result = providerError("provider", "Provider", {
      status: 401,
      message: "invalid api key super-secret-value"
    });

    expect(result.message).toBe("This route is temporarily unavailable.");
    expect(result.message).not.toContain("super-secret-value");
    expect(result.status).toBe(401);
  });

  it("uses helpful stable messages for expected provider responses", () => {
    expect(normalizeProviderError({ status: 429, message: "raw response" }))
      .toBe("This route is busy. Try again shortly.");
    expect(normalizeProviderError({ status: 422, detail: "raw response" }))
      .toBe("No route is available for these swap details.");
  });

  it("accepts only valid HTTP error statuses", () => {
    expect(getProviderErrorStatus({ status: 503 })).toBe(503);
    expect(getProviderErrorStatus({ status: 200 })).toBeUndefined();
    expect(getProviderErrorStatus(new Error("failed"))).toBeUndefined();
  });
});

describe("quote amount normalization", () => {
  it("treats provider output as post-fee and reconstructs gross output for display", () => {
    const quote = normalizeQuote(
      {},
      {
        chainId: 1,
        sellToken: "0xsell",
        sellTokenSymbol: "SELL",
        sellTokenDecimals: 18,
        buyToken: "0xbuy",
        buyTokenSymbol: "BUY",
        buyTokenDecimals: 6,
        sellAmount: "10000",
        takerAddress: "0xtaker"
      },
      { providerId: "provider", providerName: "Provider" },
      {
        buyAmount: "1000",
        minBuyAmount: "950",
        to: "0xrouter",
        data: "0x1234",
        serviceFees: [
          { label: "Service fee", amount: "25", token: "0xbuy" },
          { label: "Other-token fee", amount: "10", token: "0xother" }
        ]
      }
    );

    expect(quote.buyAmount).toBe("1000");
    expect(quote.netBuyAmount).toBe("1000");
    expect(quote.grossBuyAmount).toBe("1025");
    expect(quote.minBuyAmount).toBe("950");
  });
});
