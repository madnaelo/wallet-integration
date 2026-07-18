import type { QuoteResponse, QuoteFee, QuoteToken } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { SAME_CHAIN_QUOTE_CHAIN_IDS } from "@/lib/chains";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";
import {
  assertExecutableQuote,
  normalizeQuote,
  readProviderResponse,
  recordValue,
  stringValue,
  ZERO_ADDRESS
} from "@/lib/server/quoteNormalization";

const BITCOIN_CHAIN_ID = "20000000000001";
const BITCOIN_TOKEN_ID = "bitcoin";
const LIFI_QUOTE_TIMEOUT_MS = 15_000;

export type LifiBitcoinClientConfig = {
  baseUrl: string;
  apiKey?: string;
  integrator?: string;
  platformFee: PlatformFeeConfig;
};

export class LifiBitcoinClient implements DexAggregatorClient {
  providerId = "lifi";
  providerName = "LI.FI";
  supportedChainIds: number[] = [...SAME_CHAIN_QUOTE_CHAIN_IDS];

  constructor(private readonly cfg: LifiBitcoinClientConfig) {}

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    if (!this.supportedChainIds.includes(params.chainId)) {
      throw new Error("Native Bitcoin quotes are not available from this network yet.");
    }
    if (!isBitcoinToken(params.sellToken) && !isBitcoinToken(params.buyToken)) {
      throw new Error("LI.FI Bitcoin quotes require native Bitcoin on one side.");
    }
    if (!params.toAddress) throw new Error("Choose where this swap should be received.");

    const url = new URL("/v1/quote", this.cfg.baseUrl);
    url.searchParams.set("fromChain", isBitcoinToken(params.sellToken) ? BITCOIN_CHAIN_ID : String(params.chainId));
    url.searchParams.set("toChain", isBitcoinToken(params.buyToken) ? BITCOIN_CHAIN_ID : String(params.chainId));
    url.searchParams.set("fromToken", toLifiToken(params.sellToken));
    url.searchParams.set("toToken", toLifiToken(params.buyToken));
    url.searchParams.set("fromAddress", params.takerAddress);
    url.searchParams.set("toAddress", params.toAddress);
    url.searchParams.set("fromAmount", params.sellAmount);
    if (typeof params.slippageBps === "number") {
      url.searchParams.set("slippage", String(params.slippageBps / 10_000));
    }

    const integrator = this.cfg.integrator?.trim();
    if (integrator) {
      url.searchParams.set("integrator", integrator);
      if (this.cfg.platformFee.enabled) url.searchParams.set("fee", String(this.cfg.platformFee.feeFraction));
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(this.cfg.apiKey?.trim() ? { "x-lifi-api-key": this.cfg.apiKey.trim() } : {})
      },
      cache: "no-store",
      signal: params.signal ?? AbortSignal.timeout(LIFI_QUOTE_TIMEOUT_MS)
    });
    const body = await readProviderResponse(res, this.providerName);

    return this.normalizeLifiQuote(body, params, Boolean(integrator && this.cfg.platformFee.enabled));
  }

  private normalizeLifiQuote(body: Record<string, unknown>, params: QuoteParams, hasPlatformFee: boolean): QuoteResponse {
    const estimate = recordValue(body.estimate);
    const tx = recordValue(body.transactionRequest);
    const toolDetails = recordValue(body.toolDetails);
    const gasCosts = Array.isArray(estimate.gasCosts) ? estimate.gasCosts : [];
    const fields = {
      buyAmount: stringValue(estimate.toAmount),
      minBuyAmount: stringValue(estimate.toAmountMin),
      to: stringValue(tx.to),
      data: stringValue(tx.data),
      value: stringValue(tx.value) || "0",
      gas: stringValue(tx.gasLimit) || stringValue(tx.gas),
      gasPrice: stringValue(tx.gasPrice) || gasCostPrice(gasCosts),
      allowanceTarget: stringValue(estimate.approvalAddress) || stringValue(tx.to),
      routeLines: [
        {
          source: stringValue(toolDetails.name) || stringValue(body.tool) || "LI.FI",
          share: "Best route"
        }
      ],
      serviceFees: collectLifiFees(estimate.feeCosts),
      platformFeeBps: hasPlatformFee ? this.cfg.platformFee.feeBps : undefined
    };

    assertExecutableQuote(params, fields, { quoteOnly: isBitcoinToken(params.sellToken) });
    if (!fields.buyAmount) throw new Error("LI.FI did not return a Bitcoin output amount.");

    return normalizeQuote(params, this, {
      ...fields,
      executionKind: isBitcoinToken(params.sellToken) ? "bitcoin-to-evm" : "evm-to-bitcoin",
      totalNetworkFee: sumCostAmounts(gasCosts),
      networkFeeToken: firstCostToken(gasCosts)
    });
  }
}

function collectLifiFees(value: unknown): QuoteFee[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((feeValue) => {
    const fee = recordValue(feeValue);
    const tokenDetails = recordValue(fee.token);
    const amount = stringValue(fee.amount);
    const token = stringValue(tokenDetails.address);
    if (!amount || !token) return [];
    return [
      {
        label: feeLabel(stringValue(fee.name)),
        amount,
        token
      }
    ];
  });
}

function feeLabel(name: string): string {
  return /gas/i.test(name) ? "Bridge fee" : "Service fee";
}

function gasCostPrice(costs: unknown[]): string {
  for (const cost of costs) {
    const price = stringValue(recordValue(cost).price);
    if (price) return price;
  }
  return "";
}

function sumCostAmounts(costs: unknown[]): string {
  const total = costs.reduce<bigint>((sum, cost) => {
    const amount = stringValue(recordValue(cost).amount);
    return /^\d+$/.test(amount) ? sum + BigInt(amount) : sum;
  }, 0n);
  return total > 0n ? total.toString() : "";
}

function toLifiToken(token: string): string {
  if (isBitcoinToken(token)) return BITCOIN_TOKEN_ID;
  return token === "ETH" ? ZERO_ADDRESS : token;
}

function isBitcoinToken(token: string): boolean {
  return token.trim().toLowerCase() === BITCOIN_TOKEN_ID;
}

function firstCostToken(costs: unknown[]): QuoteToken | undefined {
  for (const cost of costs) {
    const token = recordValue(recordValue(cost).token);
    const address = stringValue(token.address);
    const symbol = stringValue(token.symbol);
    const decimals = Number(token.decimals);
    if (address && symbol && Number.isInteger(decimals) && decimals >= 0) {
      return { address, symbol, decimals };
    }
  }
  return undefined;
}
