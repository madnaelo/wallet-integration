import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";

export type ZeroXClientConfig = {
  apiKey: string;
  baseUrl: string;
  affiliateAddress: string;
  buyTokenPercentageFee: number;
};

export class ZeroXClient implements DexAggregatorClient {
  private cfg: ZeroXClientConfig;

  constructor(cfg: ZeroXClientConfig) {
    this.cfg = cfg;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const url = new URL("/swap/allowance-holder/quote", this.cfg.baseUrl);

    url.searchParams.set("chainId", String(params.chainId));
    const sellToken = normalizeTokenAddress(params.sellToken);
    const buyToken = normalizeTokenAddress(params.buyToken);

    url.searchParams.set("sellToken", sellToken);
    url.searchParams.set("buyToken", buyToken);
    url.searchParams.set("sellAmount", params.sellAmount);
    url.searchParams.set("taker", params.takerAddress);
    if (typeof params.slippageBps === "number") {
      url.searchParams.set("slippageBps", String(params.slippageBps));
    }

    if (this.cfg.affiliateAddress !== "0x0000000000000000000000000000000000000000") {
      url.searchParams.set("swapFeeRecipient", this.cfg.affiliateAddress);
      url.searchParams.set("swapFeeBps", String(Math.round(this.cfg.buyTokenPercentageFee * 10_000)));
      url.searchParams.set("swapFeeToken", buyToken);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": this.cfg.apiKey,
        "0x-version": "v2"
      },
      cache: "no-store"
    });

    const bodyText = await res.text();
    let body: any = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }

    if (!res.ok) {
      const detail = body?.data?.details?.[0];
      const detailMessage = detail?.field && detail?.reason ? `${detail.field}: ${detail.reason}` : undefined;
      const msg =
        detailMessage ||
        body?.reason ||
        body?.validationErrors?.[0]?.reason ||
        body?.message ||
        body?.error ||
        `0x error (${res.status})`;
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return normalizeQuote(body);
  }
}

function normalizeTokenAddress(token: string): string {
  return token === "ETH" ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" : token;
}

function normalizeQuote(body: any): QuoteResponse {
  return {
    ...body,
    to: body?.transaction?.to ?? body?.to,
    data: body?.transaction?.data ?? body?.data,
    value: body?.transaction?.value ?? body?.value ?? "0",
    gas: body?.transaction?.gas ?? body?.gas,
    allowanceTarget: body?.issues?.allowance?.spender ?? body?.allowanceTarget
  } as QuoteResponse;
}
