import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuoteParams } from "@/lib/server/aggregator";
import { LifiClient } from "@/lib/server/lifiClient";
import { OneInchClient } from "@/lib/server/oneInchClient";
import { ParaswapClient } from "@/lib/server/paraswapClient";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";
import { ZeroXClient } from "@/lib/server/zeroxClient";
import { NATIVE_BITCOIN_CHAIN_ID } from "@/lib/tokens";

const FEE_RECIPIENT = "0x18a5bAABfD3a5a7f6ca30B74b6A60fFe5454454D";
const BUY_TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const SELL_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ROUTER = "0x1111111111111111111111111111111111111111";
const ALLOWANCE_TARGET = "0x2222222222222222222222222222222222222222";
const feeConfig: PlatformFeeConfig = {
  enabled: true,
  recipient: FEE_RECIPIENT,
  feeBps: 20,
  feePercent: "0.2",
  feeFraction: 0.002,
  paraswapPartner: "swapassistant"
};

const params: QuoteParams = {
  chainId: 1,
  sellToken: SELL_TOKEN,
  sellTokenSymbol: "WETH",
  sellTokenDecimals: 18,
  buyToken: BUY_TOKEN,
  buyTokenSymbol: "USDT",
  buyTokenDecimals: 6,
  sellAmount: "10000000000000000",
  takerAddress: FEE_RECIPIENT,
  slippageBps: 50
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider monetization requests", () => {
  it("sends the complete 0x affiliate fee tuple and preserves its net output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      buyAmount: "1000",
      minBuyAmount: "950",
      fees: {
        zeroExFee: { amount: "3", token: BUY_TOKEN },
        integratorFee: { amount: "2", token: BUY_TOKEN }
      },
      route: {
        fills: [{ source: "Uniswap_V3", proportionBps: "10000", from: SELL_TOKEN, to: BUY_TOKEN }]
      },
      issues: { allowance: { spender: ALLOWANCE_TARGET } },
      transaction: { to: ROUTER, data: "0x1234", value: "0", gas: "100000" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await new ZeroXClient({
      apiKey: "test-key",
      baseUrl: "https://api.0x.org",
      platformFee: feeConfig
    }).getQuote(params);

    const url = requestUrl(fetchMock);
    expect(url.searchParams.get("swapFeeRecipient")).toBe(FEE_RECIPIENT);
    expect(url.searchParams.get("swapFeeBps")).toBe("20");
    expect(url.searchParams.get("swapFeeToken")).toBe(BUY_TOKEN);
    expect(quote.netBuyAmount).toBe("1000");
    expect(quote.grossBuyAmount).toBe("1005");
    expect(quote.routeLines).toEqual([{ source: "Uniswap_V3", share: "100%" }]);
    expect(quote.serviceFees).toHaveLength(2);
    expect(quote).not.toHaveProperty("transaction");
    expect(quote).not.toHaveProperty("fees");
    expect(quote).not.toHaveProperty("route");
  });

  it("sends 1inch fee percent and referrer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      dstAmount: "1000",
      minReturnAmount: "950",
      tx: { to: ROUTER, data: "0x1234", value: params.sellAmount, gas: "100000" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await new OneInchClient({ apiKey: "test-key", platformFee: feeConfig }).getQuote({ ...params, sellToken: "ETH" });

    const url = requestUrl(fetchMock);
    expect(url.searchParams.get("fee")).toBe("0.2");
    expect(url.searchParams.get("referrer")).toBe(FEE_RECIPIENT);
    expect(url.searchParams.get("origin")).toBe(FEE_RECIPIENT);
  });

  it("sends the complete Velora direct-fee configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      priceRoute: {
        destAmount: "1000",
        destAmountWithSlippage: "950",
        tokenTransferProxy: ALLOWANCE_TARGET,
        bestRoute: []
      },
      txParams: { to: ROUTER, data: "0x1234", value: "0", gas: "100000" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await new ParaswapClient({
      baseUrl: "https://api.paraswap.io",
      apiKeyHeader: "X-API-Key",
      platformFee: feeConfig
    }).getQuote(params);

    const url = requestUrl(fetchMock);
    expect(url.searchParams.get("partner")).toBe("swapassistant");
    expect(url.searchParams.get("partnerFeeBps")).toBe("20");
    expect(url.searchParams.get("partnerAddress")).toBe(FEE_RECIPIENT);
    expect(url.searchParams.get("takeSurplus")).toBe("true");
    expect(url.searchParams.get("isDirectFeeTransfer")).toBe("true");
  });

  it("sends LI.FI integrator fees and does not deduct disclosed fees twice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      tool: "bridge",
      estimate: {
        toAmount: "1000",
        toAmountMin: "950",
        approvalAddress: ALLOWANCE_TARGET,
        feeCosts: [{ name: "Integrator fee", amount: "2", token: { address: "bitcoin" } }],
        gasCosts: []
      },
      transactionRequest: { to: ROUTER, data: "0x1234", value: "0", gasLimit: "100000" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await new LifiClient({
      baseUrl: "https://li.quest",
      apiKey: "test-key",
      integrator: "swapassistant",
      platformFee: feeConfig
    }).getQuote({
      ...params,
      buyChainId: NATIVE_BITCOIN_CHAIN_ID,
      buyToken: "bitcoin",
      buyTokenSymbol: "BTC",
      buyTokenDecimals: 8,
      toAddress: "bc1qrecipient"
    });

    const url = requestUrl(fetchMock);
    expect(url.searchParams.get("integrator")).toBe("swapassistant");
    expect(url.searchParams.get("fee")).toBe("0.002");
    expect(url.searchParams.get("fromChain")).toBe("1");
    expect(url.searchParams.get("toChain")).toBe(String(NATIVE_BITCOIN_CHAIN_ID));
    expect(quote.netBuyAmount).toBe("1000");
    expect(quote.grossBuyAmount).toBe("1002");
  });
});

function jsonResponse(body: Record<string, unknown>): Response {
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
