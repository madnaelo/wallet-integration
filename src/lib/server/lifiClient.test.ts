import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuoteParams } from "@/lib/server/aggregator";
import { LifiClient } from "@/lib/server/lifiClient";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";
import { NATIVE_BITCOIN_CHAIN_ID, NATIVE_SOLANA_TOKEN_ADDRESS, SOLANA_CHAIN_ID } from "@/lib/tokens";

const SELL_TOKEN = "0x1111111111111111111111111111111111111111";
const BUY_TOKEN = "0x2222222222222222222222222222222222222222";
const ROUTER = "0x3333333333333333333333333333333333333333";
const WALLET = "0x4444444444444444444444444444444444444444";
const feeConfig: PlatformFeeConfig = {
  enabled: true,
  recipient: WALLET,
  feeBps: 20,
  feePercent: "0.2",
  feeFraction: 0.002,
  paraswapPartner: "swapassistant"
};

const baseParams: QuoteParams = {
  chainId: 1,
  buyChainId: 8453,
  sellToken: SELL_TOKEN,
  sellTokenSymbol: "SELL",
  sellTokenDecimals: 18,
  buyToken: BUY_TOKEN,
  buyTokenSymbol: "BUY",
  buyTokenDecimals: 6,
  sellAmount: "1000000000000000000",
  takerAddress: WALLET,
  toAddress: WALLET,
  slippageBps: 50
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LI.FI routing", () => {
  it("requests an executable cross-chain route with monetization intact", async () => {
    const fetchMock = vi.fn().mockResolvedValue(lifiResponse({
      transactionRequest: {
        to: ROUTER,
        data: "0x1234",
        value: "0x0",
        gasLimit: "0x186a0"
      }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await createClient().getQuote(baseParams);
    const url = requestUrl(fetchMock);

    expect(url.searchParams.get("fromChain")).toBe("1");
    expect(url.searchParams.get("toChain")).toBe("8453");
    expect(url.searchParams.get("integrator")).toBe("swapassistant");
    expect(url.searchParams.get("fee")).toBe("0.002");
    expect(quote).toMatchObject({
      executionKind: "evm-cross-chain",
      fromChainId: 1,
      toChainId: 8453,
      buyAmount: "1000"
    });
    expect(quote.gas).toBe("100000");
  });

  it("labels same-chain routes without losing network identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lifiResponse()));

    const quote = await createClient().getQuote({ ...baseParams, buyChainId: 1 });

    expect(quote.executionKind).toBe("evm-same-chain");
    expect(quote.fromChainId).toBe(1);
    expect(quote.toChainId).toBe(1);
  });

  it("preserves an executable Bitcoin PSBT and identifies its networks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lifiResponse({
      transactionRequest: { data: "70736274ff00", value: "100000" }
    }, "200")));

    const quote = await createClient().getQuote({
      ...baseParams,
      chainId: NATIVE_BITCOIN_CHAIN_ID,
      buyChainId: 1,
      sellToken: "bitcoin",
      sellTokenSymbol: "BTC",
      sellTokenDecimals: 8,
      takerAddress: "bc1qexample",
      sellAmount: "100000"
    });

    expect(quote.executionKind).toBe("bitcoin-to-evm");
    expect(quote.fromChainId).toBe(NATIVE_BITCOIN_CHAIN_ID);
    expect(quote.toChainId).toBe(1);
    expect(quote.data).toBe("70736274ff00");
  });

  it("preserves an executable Solana transaction", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(lifiResponse({
      transactionRequest: { data: "AQIDBAUGBwgJCgsMDQ4PEA==" }
    }, "200000")));

    const quote = await createClient().getQuote({
      ...baseParams,
      chainId: SOLANA_CHAIN_ID,
      buyChainId: 1,
      sellToken: NATIVE_SOLANA_TOKEN_ADDRESS,
      sellTokenSymbol: "SOL",
      sellTokenDecimals: 9,
      takerAddress: NATIVE_SOLANA_TOKEN_ADDRESS,
      sellAmount: "100000000"
    });

    expect(quote.executionKind).toBe("solana-source");
    expect(quote.fromChainId).toBe(SOLANA_CHAIN_ID);
    expect(quote.data).toBe("AQIDBAUGBwgJCgsMDQ4PEA==");
  });

  it("rejects a Bitcoin token paired with an EVM chain id", async () => {
    await expect(createClient().getQuote({ ...baseParams, sellToken: "bitcoin" }))
      .rejects.toThrow(/does not match/i);
  });

  it("rejects a route that omits the configured integrator fee", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tool: "relay",
      integrator: "swapassistant",
      fee: 0.002,
      estimate: { toAmount: "1000", toAmountMin: "950", feeCosts: [], gasCosts: [] },
      transactionRequest: { to: ROUTER, data: "0x1234", value: "0", gasLimit: "100000" }
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(createClient().getQuote(baseParams)).rejects.toThrow(/configured service fee/i);
  });
});

function createClient() {
  return new LifiClient({
    baseUrl: "https://li.quest",
    apiKey: "test-key",
    integrator: "swapassistant",
    platformFee: feeConfig
  });
}

function lifiResponse(
  overrides: Record<string, unknown> = {},
  integratorFeeAmount = "2000000000000000"
): Response {
  const body = {
    tool: "relay",
    integrator: "swapassistant",
    fee: 0.002,
    estimate: {
      toAmount: "1000",
      toAmountMin: "950",
      approvalAddress: ROUTER,
      feeCosts: [{
        name: "LIFI Fixed Fee",
        amount: integratorFeeAmount,
        token: { address: SELL_TOKEN },
        feeSplit: {
          recipients: [
            { name: "LI.FI", type: "FIXED", fee: "1" },
            { name: "swapassistant", type: "FIXED", fee: integratorFeeAmount }
          ]
        }
      }],
      gasCosts: []
    },
    transactionRequest: {
      to: ROUTER,
      data: "0x1234",
      value: "0",
      gasLimit: "100000"
    },
    ...overrides
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  const input = fetchMock.mock.calls[0]?.[0];
  if (typeof input !== "string" && !(input instanceof URL)) throw new Error("Expected a URL request.");
  return new URL(input.toString());
}
