import { describe, expect, it } from "vitest";

import {
  assertExecutableQuote,
  getProviderErrorStatus,
  normalizeQuote,
  normalizeProviderError,
  providerError,
  readProviderResponse
} from "@/lib/server/quoteNormalization";
import type { QuoteParams } from "@/lib/server/aggregator";

const ROUTER = "0x1111111111111111111111111111111111111111";
const ALLOWANCE_TARGET = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x3333333333333333333333333333333333333333";
const baseParams: QuoteParams = {
  chainId: 1,
  sellToken: TOKEN,
  sellTokenSymbol: "SELL",
  sellTokenDecimals: 18,
  buyToken: "0x4444444444444444444444444444444444444444",
  buyTokenSymbol: "BUY",
  buyTokenDecimals: 6,
  sellAmount: "100",
  takerAddress: "0x5555555555555555555555555555555555555555"
};

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

  it("returns only the normalized executable contract", () => {
    const quote = normalizeQuote(
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
        to: "0xrouter",
        data: "0x1234",
        gas: "21000",
        gasPrice: "100",
        totalNetworkFee: "2100000"
      }
    );

    expect(quote).toMatchObject({
      providerId: "provider",
      gas: "21000",
      gasPrice: "100",
      totalNetworkFee: "2100000"
    });
    expect(quote).not.toHaveProperty("transaction");
    expect(quote).not.toHaveProperty("route");
    expect(quote).not.toHaveProperty("fees");
  });
});

describe("provider response limits", () => {
  it("parses normal provider responses", async () => {
    await expect(readProviderResponse(new Response('{"buyAmount":"1000"}'), "Provider"))
      .resolves.toEqual({ buyAmount: "1000" });
  });

  it("does not treat non-object JSON as a provider object", async () => {
    await expect(readProviderResponse(new Response('[{"buyAmount":"1000"}]'), "Provider"))
      .resolves.toEqual({});
    await expect(readProviderResponse(new Response('"unexpected"'), "Provider"))
      .resolves.toEqual({});
  });

  it("retains a provider status without trusting malformed error payloads", async () => {
    const response = new Response('["upstream error"]', { status: 503 });
    await expect(readProviderResponse(response, "Provider")).rejects.toMatchObject({
      status: 503,
      message: "Provider quote unavailable (503)",
      body: {}
    });
  });

  it("rejects a declared response larger than the safe limit", async () => {
    const response = new Response("{}", { headers: { "Content-Length": String(3 * 1024 * 1024) } });
    await expect(readProviderResponse(response, "Provider")).rejects.toMatchObject({ status: 502 });
  });

  it("rejects an oversized streamed response without a content length", async () => {
    const response = new Response("x".repeat(2 * 1024 * 1024 + 1));
    await expect(readProviderResponse(response, "Provider")).rejects.toMatchObject({ status: 502 });
  });
});

describe("executable quote validation", () => {
  it("accepts a bounded token transaction", () => {
    expect(() => assertExecutableQuote(baseParams, {
      buyAmount: "200",
      minBuyAmount: "190",
      to: ROUTER,
      data: "0x1234",
      value: "0",
      gas: "100000",
      allowanceTarget: ALLOWANCE_TARGET
    })).not.toThrow();
  });

  it("requires the exact native sell amount as transaction value", () => {
    const nativeParams = { ...baseParams, sellToken: "ETH" };
    expect(() => assertExecutableQuote(nativeParams, {
      buyAmount: "200",
      to: ROUTER,
      data: "0x1234",
      value: "100"
    })).not.toThrow();
    expect(() => assertExecutableQuote(nativeParams, {
      buyAmount: "200",
      to: ROUTER,
      data: "0x1234",
      value: "101"
    })).toThrow(/unexpected transaction value/i);
  });

  it.each([
    { fields: { buyAmount: "0", to: ROUTER, data: "0x1234", value: "0" }, message: /output amount/i },
    { fields: { buyAmount: "200", minBuyAmount: "201", to: ROUTER, data: "0x1234", value: "0" }, message: /minimum output/i },
    { fields: { buyAmount: "200", to: "0x0000000000000000000000000000000000000000", data: "0x1234", value: "0" }, message: /swap contract/i },
    { fields: { buyAmount: "200", to: ROUTER, data: "0x123", value: "0" }, message: /transaction data/i },
    { fields: { buyAmount: "200", to: ROUTER, data: "0x1234", value: "1" }, message: /transaction value/i },
    { fields: { buyAmount: "200", to: ROUTER, data: "0x1234", value: "0", allowanceTarget: "0x0000000000000000000000000000000000000000" }, message: /approval contract/i }
  ])("rejects unsafe provider fields", ({ fields, message }) => {
    expect(() => assertExecutableQuote(baseParams, fields)).toThrow(message);
  });

  it("validates quote amounts without requiring EVM transaction fields for quote-only routes", () => {
    expect(() => assertExecutableQuote(
      { ...baseParams, sellToken: "bitcoin" },
      { buyAmount: "200" },
      { quoteOnly: true }
    )).not.toThrow();
  });
});
