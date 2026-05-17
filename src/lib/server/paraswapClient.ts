import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
  assertExecutableQuote,
  collectNestedProtocolLines,
  NATIVE_TOKEN_ADDRESS,
  normalizeNativeToken,
  normalizeQuote,
  readProviderResponse,
  stringValue,
  toMinAmount
} from "@/lib/server/quoteNormalization";

export type ParaswapClientConfig = {
  baseUrl: string;
};

export class ParaswapClient implements DexAggregatorClient {
  providerId = "paraswap";
  providerName = "ParaSwap";
  supportedChainIds = [1, 137, 8453];

  private cfg: ParaswapClientConfig;

  constructor(cfg: ParaswapClientConfig) {
    this.cfg = cfg;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const url = new URL("/swap", this.cfg.baseUrl);
    url.searchParams.set("network", String(params.chainId));
    url.searchParams.set("srcToken", normalizeNativeToken(params.sellToken, NATIVE_TOKEN_ADDRESS));
    url.searchParams.set("destToken", normalizeNativeToken(params.buyToken, NATIVE_TOKEN_ADDRESS));
    url.searchParams.set("srcDecimals", String(params.sellTokenDecimals));
    url.searchParams.set("destDecimals", String(params.buyTokenDecimals));
    url.searchParams.set("amount", params.sellAmount);
    url.searchParams.set("side", "SELL");
    url.searchParams.set("userAddress", params.takerAddress);
    url.searchParams.set("receiver", params.takerAddress);
    url.searchParams.set("slippage", String(params.slippageBps ?? 100));
    url.searchParams.set("partner", "thewallet");
    url.searchParams.set("version", "6.2");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const body = await readProviderResponse(res, this.providerName);
    const raw: any = body;
    const priceRoute = raw.priceRoute ?? raw;
    const tx = raw.txParams ?? raw.transaction ?? raw.tx ?? {};
    const buyAmount = stringValue(priceRoute.destAmount) || stringValue(raw.destAmount);
    const fields = {
      buyAmount,
      minBuyAmount: stringValue(priceRoute.destAmountWithSlippage) || toMinAmount(buyAmount, params.slippageBps),
      to: stringValue(tx.to),
      data: stringValue(tx.data),
      value: stringValue(tx.value) || "0",
      gas: stringValue(tx.gas) || String(raw.gas ?? ""),
      gasPrice: stringValue(tx.gasPrice),
      allowanceTarget: stringValue(priceRoute.tokenTransferProxy) || stringValue(raw.tokenTransferProxy) || stringValue(tx.to),
      routeLines: collectNestedProtocolLines(priceRoute.bestRoute ?? priceRoute.route ?? priceRoute)
    };

    assertExecutableQuote(fields);
    if (!fields.buyAmount) throw new Error("ParaSwap did not return an output amount.");

    return normalizeQuote(body, params, this, fields);
  }
}
