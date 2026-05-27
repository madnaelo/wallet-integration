import type { QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { SAME_CHAIN_QUOTE_CHAIN_IDS } from "@/lib/chains";
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
import type { PlatformFeeConfig } from "@/lib/server/platformFees";

export type ParaswapClientConfig = {
  baseUrl: string;
  apiKey?: string;
  apiKeyHeader: string;
  platformFee: PlatformFeeConfig;
};

export class ParaswapClient implements DexAggregatorClient {
  providerId = "paraswap";
  providerName = "ParaSwap";
  supportedChainIds: number[] = [...SAME_CHAIN_QUOTE_CHAIN_IDS];

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
    url.searchParams.set("receiver", params.toAddress || params.takerAddress);
    url.searchParams.set("slippage", String(params.slippageBps ?? 100));
    url.searchParams.set("partner", this.cfg.platformFee.paraswapPartner);
    url.searchParams.set("version", "6.2");
    if (this.cfg.platformFee.enabled || isDifferentReceiver(params)) {
      url.searchParams.set("includeContractMethods", "simpleSwap,multiSwap,megaSwap");
    }
    if (this.cfg.platformFee.enabled) {
      url.searchParams.set("partnerFeeBps", String(this.cfg.platformFee.feeBps));
      url.searchParams.set("partnerAddress", this.cfg.platformFee.recipient);
      url.searchParams.set("takeSurplus", "true");
      url.searchParams.set("isDirectFeeTransfer", "true");
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers(),
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
      routeLines: collectNestedProtocolLines(priceRoute.bestRoute ?? priceRoute.route ?? priceRoute),
      platformFeeBps: this.cfg.platformFee.enabled ? this.cfg.platformFee.feeBps : undefined
    };

    assertExecutableQuote(fields);
    if (!fields.buyAmount) throw new Error("ParaSwap did not return an output amount.");

    return normalizeQuote(body, params, this, fields);
  }

  private headers(): Record<string, string> {
    const apiKey = this.cfg.apiKey?.trim();
    const apiKeyHeader = normalizeHeaderName(this.cfg.apiKeyHeader);

    return {
      Accept: "application/json",
      ...(apiKey && apiKeyHeader ? { [apiKeyHeader]: apiKey } : {})
    };
  }
}

function normalizeHeaderName(value: string): string {
  const header = value.trim();
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(header)) return "";
  return header;
}

function isDifferentReceiver(params: QuoteParams): boolean {
  return Boolean(params.toAddress && params.toAddress.trim().toLowerCase() !== params.takerAddress.trim().toLowerCase());
}
