import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
  assertExecutableQuote,
  collectNestedProtocolLines,
  normalizeNativeToken,
  normalizeQuote,
  readProviderResponse,
  stringValue,
  toSlippagePercent
} from "@/lib/server/quoteNormalization";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";

const ONEINCH_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export type OneInchClientConfig = {
  apiKey: string;
  platformFee: PlatformFeeConfig;
  baseUrl?: string;
};

export class OneInchClient implements DexAggregatorClient {
  providerId = "1inch";
  providerName = "1inch";
  supportedChainIds = [1, 137, 8453];

  private cfg: Required<OneInchClientConfig>;

  constructor(cfg: OneInchClientConfig) {
    this.cfg = {
      apiKey: cfg.apiKey,
      platformFee: cfg.platformFee,
      baseUrl: cfg.baseUrl ?? "https://api.1inch.dev"
    };
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const spenderPromise = params.sellToken === "ETH" ? Promise.resolve("") : this.getAllowanceTarget(params.chainId);
    const url = new URL(`/swap/v6.1/${params.chainId}/swap`, this.cfg.baseUrl);
    url.searchParams.set("src", normalizeNativeToken(params.sellToken, ONEINCH_NATIVE_TOKEN));
    url.searchParams.set("dst", normalizeNativeToken(params.buyToken, ONEINCH_NATIVE_TOKEN));
    url.searchParams.set("amount", params.sellAmount);
    url.searchParams.set("from", params.takerAddress);
    url.searchParams.set("origin", params.takerAddress);
    url.searchParams.set("slippage", toSlippagePercent(params.slippageBps));
    url.searchParams.set("includeProtocols", "true");
    url.searchParams.set("includeGas", "true");
    url.searchParams.set("disableEstimate", "true");
    if (this.cfg.platformFee.enabled) {
      url.searchParams.set("fee", this.cfg.platformFee.feePercent);
      url.searchParams.set("referrer", this.cfg.platformFee.recipient);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers(),
      cache: "no-store"
    });

    const body = await readProviderResponse(res, this.providerName);
    const raw: any = body;
    const tx = raw.tx ?? {};
    const fields = {
      buyAmount: stringValue(raw.dstAmount) || stringValue(raw.toAmount),
      minBuyAmount: stringValue(raw.minReturnAmount),
      to: stringValue(tx.to),
      data: stringValue(tx.data),
      value: stringValue(tx.value) || "0",
      gas: String(tx.gas ?? raw.gas ?? ""),
      gasPrice: stringValue(tx.gasPrice),
      allowanceTarget: (await spenderPromise) || stringValue(tx.to),
      routeLines: collectNestedProtocolLines(raw.protocols),
      platformFeeBps: this.cfg.platformFee.enabled ? this.cfg.platformFee.feeBps : undefined
    };

    assertExecutableQuote(fields);
    if (!fields.buyAmount) throw new Error("1inch did not return an output amount.");

    return normalizeQuote(body, params, this, fields);
  }

  private async getAllowanceTarget(chainId: number): Promise<string> {
    const url = new URL(`/swap/v6.1/${chainId}/approve/spender`, this.cfg.baseUrl);
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers(),
      cache: "force-cache"
    });
    const body = await readProviderResponse(res, this.providerName);
    return stringValue((body as any).address);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      Accept: "application/json"
    };
  }
}
