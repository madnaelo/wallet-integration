import type { QuoteFee, QuoteResponse } from "@/lib/types";
import type { DexAggregatorClient, QuoteParams } from "@/lib/server/aggregator";
import { ZERO_X_SWAP_CHAIN_IDS } from "@/lib/chains";
import {
  assertExecutableQuote,
  collectNestedProtocolLines,
  normalizeNativeToken,
  normalizeQuote,
  readProviderResponse,
  recordValue,
  stringValue
} from "@/lib/server/quoteNormalization";
import { ZERO_ADDRESS, type PlatformFeeConfig } from "@/lib/server/platformFees";
import { FeeValidationError } from "@/lib/server/feeValidationError";

export type ZeroXClientConfig = {
  apiKey: string;
  baseUrl: string;
  platformFee: PlatformFeeConfig;
};

export class ZeroXClient implements DexAggregatorClient {
  providerId = "0x";
  providerName = "0x";
  supportedChainIds: number[] = [...ZERO_X_SWAP_CHAIN_IDS];

  private cfg: ZeroXClientConfig;

  constructor(cfg: ZeroXClientConfig) {
    this.cfg = cfg;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    if (this.cfg.platformFee.enabled && this.cfg.platformFee.recipient === ZERO_ADDRESS) {
      throw new FeeValidationError("0x requires a non-zero FEE_RECIPIENT_ADDRESS for monetized routes.");
    }
    const url = new URL("/swap/allowance-holder/quote", this.cfg.baseUrl);

    url.searchParams.set("chainId", String(params.chainId));
    const sellToken = normalizeNativeToken(params.sellToken);
    const buyToken = normalizeNativeToken(params.buyToken);

    url.searchParams.set("sellToken", sellToken);
    url.searchParams.set("buyToken", buyToken);
    url.searchParams.set("sellAmount", params.sellAmount);
    url.searchParams.set("taker", params.takerAddress);
    if (params.toAddress) {
      url.searchParams.set("recipient", params.toAddress);
    }
    if (typeof params.slippageBps === "number") {
      url.searchParams.set("slippageBps", String(params.slippageBps));
    }

    if (this.cfg.platformFee.enabled) {
      url.searchParams.set("swapFeeRecipient", this.cfg.platformFee.recipient);
      url.searchParams.set("swapFeeBps", String(this.cfg.platformFee.feeBps));
      url.searchParams.set("swapFeeToken", sellToken);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": this.cfg.apiKey,
        "0x-version": "v2"
      },
      cache: "no-store",
      signal: params.signal
    });

    const body = await readZeroXResponse(res);

    if (this.cfg.platformFee.enabled) {
      assertZeroXIntegratorFee(body, params, this.cfg.platformFee.feeBps);
    }

    return this.normalizeZeroXQuote(body, params);
  }

  private normalizeZeroXQuote(body: Record<string, unknown>, params: QuoteParams): QuoteResponse {
    const transaction = recordValue(body.transaction);
    const allowance = recordValue(recordValue(body.issues).allowance);
    const fields = {
      buyAmount: stringValue(body.buyAmount),
      minBuyAmount: stringValue(body.minBuyAmount),
      to: stringValue(transaction.to) || stringValue(body.to),
      data: stringValue(transaction.data) || stringValue(body.data),
      value: stringValue(transaction.value) || stringValue(body.value) || "0",
      gas: stringValue(transaction.gas) || stringValue(body.gas),
      gasPrice: stringValue(transaction.gasPrice),
      totalNetworkFee: stringValue(body.totalNetworkFee),
      allowanceTarget: stringValue(allowance.spender) || stringValue(body.allowanceTarget),
      routeLines: collectNestedProtocolLines(body.route),
      serviceFees: collectZeroXFees(body),
      platformFeeBps: this.cfg.platformFee.enabled ? this.cfg.platformFee.feeBps : undefined
    };

    assertExecutableQuote(params, fields);

    return normalizeQuote(params, this, fields);
  }
}

async function readZeroXResponse(res: Response): Promise<Record<string, unknown>> {
  const body = await readProviderResponse(res, "0x");
  if (res.ok) return body;
  return body;
}

function collectZeroXFees(body: Record<string, unknown>): QuoteFee[] {
  const fees = recordValue(body.fees);
  if (Object.keys(fees).length === 0) return [];

  const integratorFees = Array.isArray(fees.integratorFees) && fees.integratorFees.length > 0
    ? fees.integratorFees
    : [fees.integratorFee];
  const lines: QuoteFee[] = [];
  for (const [index, fee] of [fees.zeroExFee, ...integratorFees].entries()) {
    const feeRecord = recordValue(fee);
    const amount = stringValue(feeRecord.amount);
    const token = stringValue(feeRecord.token);
    if (amount && token) {
      lines.push({
        label: index === 0 ? "0x provider fee" : "Platform fee",
        kind: index === 0 ? "provider" : "platform",
        amount,
        token
      });
    }
  }
  return lines;
}

function assertZeroXIntegratorFee(body: Record<string, unknown>, params: QuoteParams, feeBps: number) {
  // Exact-input sell-token fees have a deterministic base, unlike a fee
  // reconstructed from net destination output. Solidity integer division floors.
  const expectedAmount = BigInt(params.sellAmount) * BigInt(feeBps) / 10_000n;
  if (body.sellAmount != null && stringValue(body.sellAmount) !== params.sellAmount) {
    throw new FeeValidationError("0x changed the requested sell amount.");
  }
  const fees = recordValue(body.fees);
  if (fees.integratorFees != null && !Array.isArray(fees.integratorFees)) {
    throw new FeeValidationError("0x returned invalid integrator fee details.");
  }
  const integratorFees = Array.isArray(fees.integratorFees)
    ? fees.integratorFees
    : [fees.integratorFee];
  const expectedToken = normalizeNativeToken(params.sellToken);
  const hasConfiguredFee = integratorFees.length === 1 && integratorFees.every((fee) => {
    const feeRecord = recordValue(fee);
    const amount = stringValue(feeRecord.amount);
    return /^\d{1,78}$/.test(amount)
      && BigInt(amount) > 0n
      && BigInt(amount) === expectedAmount
      && BigInt(amount) <= (1n << 256n) - 1n
      && (feeRecord.type === undefined || feeRecord.type === "volume")
      && sameAsset(stringValue(feeRecord.token), expectedToken);
  });
  if (!hasConfiguredFee) {
    throw new FeeValidationError("0x did not include the configured service fee in this route.");
  }
  // Only one recipient is requested. If both API shapes are present, they
  // must describe the same charge, not two different fees or a hidden split.
  if (fees.integratorFee != null && Array.isArray(fees.integratorFees)) {
    const legacy = recordValue(fees.integratorFee);
    const current = recordValue(integratorFees[0]);
    if (legacy.amount !== current.amount || !sameAsset(stringValue(legacy.token), stringValue(current.token))) {
      throw new FeeValidationError("0x returned conflicting integrator fee details.");
    }
  }
}

function sameAsset(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}
