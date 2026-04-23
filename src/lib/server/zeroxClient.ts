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
    const url = new URL("/swap/v1/quote", this.cfg.baseUrl);

    url.searchParams.set("sellToken", params.sellToken);
    url.searchParams.set("buyToken", params.buyToken);
    url.searchParams.set("sellAmount", params.sellAmount);
    url.searchParams.set("takerAddress", params.takerAddress);

    url.searchParams.set("affiliateAddress", this.cfg.affiliateAddress);
    url.searchParams.set("buyTokenPercentageFee", String(this.cfg.buyTokenPercentageFee));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": this.cfg.apiKey
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
      const msg = body?.reason || body?.validationErrors?.[0]?.reason || body?.error || `0x error (${res.status})`;
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }

    return body as QuoteResponse;
  }
}
