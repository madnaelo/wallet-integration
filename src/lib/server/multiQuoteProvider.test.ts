import { afterEach, describe, expect, it, vi } from "vitest";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { MultiQuoteProvider } from "@/lib/server/multiQuoteProvider";
import type { QuoteResponse } from "@/lib/types";

const params: QuoteParams = {
  chainId: 1,
  buyChainId: 1,
  sellToken: "ETH",
  sellTokenSymbol: "ETH",
  sellTokenDecimals: 18,
  buyToken: "0x0000000000000000000000000000000000000001",
  buyTokenSymbol: "USDC",
  buyTokenDecimals: 6,
  sellAmount: "1000000000000000000",
  takerAddress: "0x0000000000000000000000000000000000000002"
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("multi-provider quote fallback", () => {
  it("returns a healthy provider quote when another provider is rate limited", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const provider = new MultiQuoteProvider([
      failingClient("limited", 429),
      successfulClient("available", "2000000000")
    ]);

    const quote = await provider.getQuote(params);

    expect(quote.providerId).toBe("available");
    expect(quote.quoteErrors).toEqual([
      expect.objectContaining({ providerId: "limited", status: 429 })
    ]);
  });

  it("preserves a rate-limit result when every provider is rate limited", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new MultiQuoteProvider([
      failingClient("first", 429),
      failingClient("second", 429)
    ]);

    await expect(provider.getQuote(params)).rejects.toMatchObject({ status: 429 });
  });

  it("returns no-route semantics when every provider rejects the pair", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new MultiQuoteProvider([
      failingClient("first", 404),
      failingClient("second", 422)
    ]);

    await expect(provider.getQuote(params)).rejects.toMatchObject({ status: 422 });
  });
});

function successfulClient(providerId: string, buyAmount: string): DexAggregatorClient {
  return {
    providerId,
    providerName: providerId,
    async getQuote(): Promise<QuoteResponse> {
      return {
        providerId,
        providerName: providerId,
        buyAmount,
        sellAmount: params.sellAmount,
        to: "0x0000000000000000000000000000000000000003",
        data: "0x"
      };
    }
  };
}

function failingClient(providerId: string, status: number): DexAggregatorClient {
  return {
    providerId,
    providerName: providerId,
    async getQuote(): Promise<QuoteResponse> {
      throw Object.assign(new Error("provider failed"), { status });
    }
  };
}
