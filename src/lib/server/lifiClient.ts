import type { QuoteResponse, QuoteFee, QuoteToken } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import {
  NATIVE_BITCOIN_CHAIN_ID,
  NATIVE_BITCOIN_TOKEN_ADDRESS,
  SOLANA_CHAIN_ID
} from "@/lib/tokens";
import { getAddressFamilyForChain } from "@/lib/ecosystems";
import { isAddress, isSolanaAddress } from "@/lib/validation";
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

    if (integrator && this.cfg.platformFee.enabled) {
      assertLifiIntegratorFee(body, params, integrator, this.cfg.platformFee);
    }

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
    const sourceIsSolana = params.chainId === SOLANA_CHAIN_ID;
    assertExecutableQuote(params, fields, { quoteOnly: sourceIsBitcoin || sourceIsSolana });
    if (sourceIsBitcoin) assertBitcoinTransactionRequest(fields);
    if (sourceIsSolana) assertSolanaTransactionRequest(fields);
    if (!fields.buyAmount) throw new Error("LI.FI did not return an output amount.");

    return {
      ...normalizeQuote(params, this, {
      ...fields,
      executionKind: getExecutionKind(params.chainId, params.buyChainId ?? params.chainId),
      totalNetworkFee: sumCostAmounts(gasCosts),
      networkFeeToken: firstCostToken(gasCosts)
      }),
      providerQuoteId: stringValue(body.id),
      bridgeTool: stringValue(body.tool)
    };
  }
}

function getExecutionKind(fromChainId: number, toChainId: number): NonNullable<QuoteResponse["executionKind"]> {
  if (isBitcoinChain(fromChainId)) return "bitcoin-to-evm";
  if (fromChainId === SOLANA_CHAIN_ID) return "solana-source";
  if (isBitcoinChain(toChainId)) return "evm-to-bitcoin";
  return fromChainId === toChainId ? "evm-same-chain" : "evm-cross-chain";
}

function assertAssetMatchesChain(token: string, chainId: number, side: string) {
  const family = getAddressFamilyForChain(chainId);
  const valid = family === "bitcoin"
    ? isBitcoinToken(token)
    : family === "solana"
      ? isSolanaAddress(token)
      : token === "ETH" || isAddress(token);
  if (!valid) throw new Error(`The ${side} token does not match its selected network.`);
}

function assertBitcoinTransactionRequest(fields: { data: string; value?: string }) {
  const psbtHex = fields.data.trim();
  if (!/^70736274ff[0-9a-fA-F]*$/.test(psbtHex) || psbtHex.length > 1_048_576) {
    throw new Error("LI.FI did not return a valid Bitcoin transaction.");
  }
  if (!fields.value || !/^\d{1,16}$/.test(fields.value) || BigInt(fields.value) <= 0n) {
    throw new Error("LI.FI did not return a valid Bitcoin amount.");
  }
}

function assertSolanaTransactionRequest(fields: { data: string }) {
  const transaction = fields.data.trim();
  if (
    transaction.length < 16 ||
    transaction.length > 524_288 ||
    transaction.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(transaction)
  ) {
    throw new Error("LI.FI did not return a valid Solana transaction.");
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

function assertLifiIntegratorFee(
  body: Record<string, unknown>,
  params: QuoteParams,
  integrator: string,
  platformFee: PlatformFeeConfig
) {
  if (stringValue(body.integrator) !== integrator) {
    throw new Error("LI.FI did not preserve the configured integration on this route.");
  }

  const returnedFee = Number(body.fee);
  if (!Number.isFinite(returnedFee) || Math.abs(returnedFee - platformFee.feeFraction) > 1e-12) {
    throw new Error("LI.FI did not preserve the configured service fee on this route.");
  }

  const expectedFee = (BigInt(params.sellAmount) * BigInt(platformFee.feeBps)) / 10_000n;
  if (expectedFee <= 0n) {
    throw new Error("The swap amount is too small to apply the service fee.");
  }

  const feeCosts = Array.isArray(recordValue(body.estimate).feeCosts)
    ? recordValue(body.estimate).feeCosts as unknown[]
    : [];
  const recipientFees = feeCosts.flatMap((feeCost) => {
    const recipients = recordValue(recordValue(feeCost).feeSplit).recipients;
    return Array.isArray(recipients) ? recipients : [];
  });
  const integratorFee = recipientFees
    .map(recordValue)
    .find((recipient) => stringValue(recipient.name) === integrator);
  const returnedAmount = integratorFee ? uintStringValue(integratorFee.fee) : "";
  if (!returnedAmount || BigInt(returnedAmount) < expectedFee) {
    throw new Error("LI.FI did not include the configured service fee in this route.");
  }
}
