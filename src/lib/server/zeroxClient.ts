import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
  assertExecutableQuote,
  normalizeNativeToken,
  normalizeQuote,
  readProviderResponse,
  stringValue
} from "@/lib/server/quoteNormalization";

export type ZeroXClientConfig = {
  apiKey: string;
  baseUrl: string;
  affiliateAddress: string;
  buyTokenPercentageFee: number;
};

export class ZeroXClient implements DexAggregatorClient {
  providerId = "0x";
  providerName = "0x";

  private cfg: ZeroXClientConfig;

  constructor(cfg: ZeroXClientConfig) {
    this.cfg = cfg;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const url = new URL("/swap/allowance-holder/quote", this.cfg.baseUrl);

    url.searchParams.set("chainId", String(params.chainId));
    const sellToken = normalizeNativeToken(params.sellToken);
    const buyToken = normalizeNativeToken(params.buyToken);

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

    const body = await readZeroXResponse(res);

    return this.normalizeZeroXQuote(body, params);
  }

  private normalizeZeroXQuote(body: Record<string, unknown>, params: QuoteParams): QuoteResponse {
    const raw: any = body;
    const fields = {
      buyAmount: stringValue(raw.buyAmount),
      minBuyAmount: stringValue(raw.minBuyAmount),
      to: stringValue(raw?.transaction?.to) || stringValue(raw.to),
      data: stringValue(raw?.transaction?.data) || stringValue(raw.data),
      value: stringValue(raw?.transaction?.value) || stringValue(raw.value) || "0",
      gas: stringValue(raw?.transaction?.gas) || stringValue(raw.gas),
      gasPrice: stringValue(raw?.transaction?.gasPrice),
      allowanceTarget: stringValue(raw?.issues?.allowance?.spender) || stringValue(raw.allowanceTarget),
      serviceFees: collectZeroXFees(raw)
    };

    assertExecutableQuote(fields);

    return normalizeQuote(body, params, this, fields);
  }
}

async function readZeroXResponse(res: Response): Promise<Record<string, unknown>> {
  const body = await readProviderResponse(res, "0x");
  if (res.ok) return body;
  return body;
}

function collectZeroXFees(body: any) {
  const fees = body?.fees;
  if (!fees || typeof fees !== "object") return [];

  const lines = [];
  for (const fee of [fees.zeroExFee, fees.integratorFee, ...(Array.isArray(fees.integratorFees) ? fees.integratorFees : [])]) {
    const amount = stringValue(fee?.amount);
    const token = stringValue(fee?.token);
    if (amount && token) {
      lines.push({ label: "Service fee", amount, token });
    }
  }
  return lines;
}
