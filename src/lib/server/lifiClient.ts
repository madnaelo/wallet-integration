import type { QuoteResponse, QuoteFee, QuoteToken } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { NATIVE_BITCOIN_CHAIN_ID, NATIVE_BITCOIN_TOKEN_ADDRESS } from "@/lib/tokens";
import type { PlatformFeeConfig } from "@/lib/server/platformFees";
import {
  assertExecutableQuote,
  normalizeQuote,
  readProviderResponse,
  recordValue,
  stringValue,
  uintStringValue,
  ZERO_ADDRESS
} from "@/lib/server/quoteNormalization";

const LIFI_QUOTE_TIMEOUT_MS = 15_000;

export type LifiClientConfig = {
  baseUrl: string;
  apiKey?: string;
  integrator?: string;
  platformFee: PlatformFeeConfig;
};

export class LifiClient implements DexAggregatorClient {
  providerId = "lifi";
  providerName = "LI.FI";

  constructor(private readonly cfg: LifiClientConfig) {}

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const buyChainId = params.buyChainId ?? params.chainId;
    if (!params.toAddress) throw new Error("Choose where this swap should be received.");
    assertAssetMatchesChain(params.sellToken, params.chainId, "source");
    assertAssetMatchesChain(params.buyToken, buyChainId, "destination");

    const url = new URL("/v1/quote", this.cfg.baseUrl);
    url.searchParams.set("fromChain", String(params.chainId));
    url.searchParams.set("toChain", String(buyChainId));
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
      value: uintStringValue(tx.value) || "0",
      gas: uintStringValue(tx.gasLimit) || uintStringValue(tx.gas),
      gasPrice: uintStringValue(tx.gasPrice) || gasCostPrice(gasCosts),
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

    const sourceIsBitcoin = isBitcoinChain(params.chainId);
    assertExecutableQuote(params, fields, { quoteOnly: sourceIsBitcoin });
    if (!fields.buyAmount) throw new Error("LI.FI did not return an output amount.");

    return normalizeQuote(params, this, {
      ...fields,
      executionKind: getExecutionKind(params.chainId, params.buyChainId ?? params.chainId),
      totalNetworkFee: sumCostAmounts(gasCosts),
      networkFeeToken: firstCostToken(gasCosts)
    });
  }
}

function getExecutionKind(fromChainId: number, toChainId: number): NonNullable<QuoteResponse["executionKind"]> {
  if (isBitcoinChain(fromChainId)) return "bitcoin-to-evm";
  if (isBitcoinChain(toChainId)) return "evm-to-bitcoin";
  return fromChainId === toChainId ? "evm-same-chain" : "evm-cross-chain";
}

function assertAssetMatchesChain(token: string, chainId: number, side: string) {
  if (isBitcoinToken(token) !== isBitcoinChain(chainId)) {
    throw new Error(`The ${side} token does not match its selected network.`);
  }
}

function collectLifiFees(value: unknown): QuoteFee[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((feeValue) => {
    const fee = recordValue(feeValue);
    const tokenDetails = recordValue(fee.token);
    const amount = uintStringValue(fee.amount);
    const token = stringValue(tokenDetails.address);
    if (!amount || !token) return [];
    return [{ label: feeLabel(stringValue(fee.name)), amount, token }];
  });
}

function feeLabel(name: string): string {
  return /gas/i.test(name) ? "Bridge fee" : "Service fee";
}

function gasCostPrice(costs: unknown[]): string {
  for (const cost of costs) {
    const price = uintStringValue(recordValue(cost).price);
    if (price) return price;
  }
  return "";
}

function sumCostAmounts(costs: unknown[]): string {
  const total = costs.reduce<bigint>((sum, cost) => {
    const amount = uintStringValue(recordValue(cost).amount);
    return amount ? sum + BigInt(amount) : sum;
  }, 0n);
  return total > 0n ? total.toString() : "";
}

function toLifiToken(token: string): string {
  if (isBitcoinToken(token)) return NATIVE_BITCOIN_TOKEN_ADDRESS;
  return token === "ETH" ? ZERO_ADDRESS : token;
}

function isBitcoinToken(token: string): boolean {
  return token.trim().toLowerCase() === NATIVE_BITCOIN_TOKEN_ADDRESS;
}

function isBitcoinChain(chainId: number): boolean {
  return chainId === NATIVE_BITCOIN_CHAIN_ID;
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
