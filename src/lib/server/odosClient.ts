import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { SAME_CHAIN_QUOTE_CHAIN_IDS } from "@/lib/chains";
import {
  assertExecutableQuote,
  normalizeNativeToken,
  normalizeQuote,
  readProviderResponse,
  stringValue,
  toMinAmount,
  toSlippagePercent,
  ZERO_ADDRESS
} from "@/lib/server/quoteNormalization";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";

export type OdosClientConfig = {
  baseUrl: string;
  apiKey?: string;
  platformFee: PlatformFeeConfig;
};

export class OdosClient implements DexAggregatorClient {
  providerId = "odos";
  providerName = "Odos";
  supportedChainIds: number[] = [...SAME_CHAIN_QUOTE_CHAIN_IDS];

  private cfg: OdosClientConfig;

  constructor(cfg: OdosClientConfig) {
    this.cfg = cfg;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    if (params.toAddress && normalizeAddress(params.toAddress) !== normalizeAddress(params.takerAddress)) {
      throw new Error("Odos is unavailable for a different receive address.");
    }

    const quote = await this.fetchQuote(params);
    const assemble = await this.assembleTransaction(quote, params);
    const quoteRaw: any = quote;
    const assembleRaw: any = assemble;
    const tx = assembleRaw.transaction ?? {};
    const output = Array.isArray(quoteRaw.outAmounts) ? stringValue(quoteRaw.outAmounts[0]) : stringValue(quoteRaw.outAmount);
    const routeLines = Array.isArray(quoteRaw.pathViz)
      ? quoteRaw.pathViz.slice(0, 5).map((path: any, index: number) => ({
          source: stringValue(path?.name) || stringValue(path?.protocol) || `Route ${index + 1}`,
          share: stringValue(path?.percent) || "Best route"
        }))
      : [{ source: "Odos", share: "Best route" }];

    const fields = {
      buyAmount: output,
      minBuyAmount: toMinAmount(output, params.slippageBps),
      to: stringValue(tx.to),
      data: stringValue(tx.data),
      value: stringValue(tx.value) || "0",
      gas: String(tx.gas ?? assembleRaw.gasEstimate ?? ""),
      allowanceTarget: stringValue(tx.to),
      routeLines,
      platformFeeBps: this.cfg.platformFee.enabled ? this.cfg.platformFee.feeBps : undefined
    };

    assertExecutableQuote(fields);
    if (!fields.buyAmount) throw new Error("Odos did not return an output amount.");

    return normalizeQuote({ quote, assemble }, params, this, fields);
  }

  private async fetchQuote(params: QuoteParams): Promise<Record<string, unknown>> {
    const res = await fetch(new URL("/sor/quote/v3", this.cfg.baseUrl).toString(), {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      signal: params.signal,
      body: JSON.stringify({
        chainId: params.chainId,
        inputTokens: [
          {
            tokenAddress: normalizeNativeToken(params.sellToken, ZERO_ADDRESS),
            amount: params.sellAmount
          }
        ],
        outputTokens: [
          {
            tokenAddress: normalizeNativeToken(params.buyToken, ZERO_ADDRESS),
            proportion: 1
          }
        ],
        slippageLimitPercent: Number(toSlippagePercent(params.slippageBps)),
        userAddr: params.takerAddress,
        ...(this.cfg.platformFee.enabled
          ? {
              partnerFeePercent: this.cfg.platformFee.feeFraction,
              feeRecipient: this.cfg.platformFee.recipient
            }
          : {}),
        compact: true
      })
    });
    return readProviderResponse(res, this.providerName);
  }

  private async assembleTransaction(quote: Record<string, unknown>, params: QuoteParams): Promise<Record<string, unknown>> {
    const pathId = stringValue((quote as any).pathId);
    if (!pathId) throw new Error("Odos did not return a route id.");

    const res = await fetch(new URL("/sor/assemble", this.cfg.baseUrl).toString(), {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      signal: params.signal,
      body: JSON.stringify({
        userAddr: params.takerAddress,
        pathId,
        simulate: false
      })
    });
    return readProviderResponse(res, this.providerName);
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(this.cfg.apiKey ? { "x-api-key": this.cfg.apiKey } : {})
    };
  }
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}
