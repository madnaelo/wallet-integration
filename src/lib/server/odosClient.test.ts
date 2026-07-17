import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuoteParams } from "@/lib/server/aggregator";
import { OdosClient } from "@/lib/server/odosClient";

const FEE_RECIPIENT = "0x18a5bAABfD3a5a7f6ca30B74b6A60fFe5454454D";

const quoteParams: QuoteParams = {
  chainId: 1,
  sellToken: "ETH",
  sellTokenSymbol: "ETH",
  sellTokenDecimals: 18,
  buyToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  buyTokenSymbol: "USDT",
  buyTokenDecimals: 6,
  sellAmount: "1000000000000000",
  takerAddress: FEE_RECIPIENT,
  slippageBps: 50
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OdosClient", () => {
  it("sends the V3 referral fee fields and reports the configured platform fee", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            outAmounts: ["1840579"],
            pathId: "path-1",
            gasEstimate: 263664
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: {
              to: "0x1111111111111111111111111111111111111111",
              data: "0x1234",
              value: "1000000000000000",
              gas: 263664
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OdosClient({
      baseUrl: "https://api.odos.xyz",
      apiKey: "test-key",
      platformFee: {
        enabled: true,
        recipient: FEE_RECIPIENT,
        feeBps: 20,
        feePercent: "0.2",
        feeFraction: 0.002,
        paraswapPartner: "swapassistant"
      }
    });

    const quote = await client.getQuote(quoteParams);
    const quoteRequest = fetchMock.mock.calls[0]?.[1];
    const quoteBody = JSON.parse(String(quoteRequest?.body));

    expect(quoteBody).toMatchObject({
      referralFee: 0.002,
      referralFeeRecipient: FEE_RECIPIENT,
      userAddr: FEE_RECIPIENT
    });
    expect(quoteBody).not.toHaveProperty("partnerFeePercent");
    expect(quoteBody).not.toHaveProperty("feeRecipient");
    expect(new Headers(quoteRequest?.headers).get("x-api-key")).toBe("test-key");
    expect(quote.platformFeeBps).toBe(20);
  });

  it("does not add referral fields when platform fees are disabled", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ outAmounts: ["1840579"], pathId: "path-2" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transaction: {
              to: "0x1111111111111111111111111111111111111111",
              data: "0x1234",
              value: "1000000000000000"
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OdosClient({
      baseUrl: "https://api.odos.xyz",
      platformFee: {
        enabled: false,
        recipient: "0x0000000000000000000000000000000000000000",
        feeBps: 0,
        feePercent: "0",
        feeFraction: 0,
        paraswapPartner: "swapassistant"
      }
    });

    await client.getQuote(quoteParams);
    const quoteBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(quoteBody).not.toHaveProperty("referralFee");
    expect(quoteBody).not.toHaveProperty("referralFeeRecipient");
  });
});
