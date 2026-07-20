import type { QuoteFee, QuoteResponse, QuoteRouteLine } from "@/lib/types";
import type { QuoteParams } from "@/lib/server/aggregator";

export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CALLDATA_HEX_LENGTH = 256 * 1024;
const MAX_GAS_UNITS = 100_000_000n;
const UINT256_MAX = (1n << 256n) - 1n;

export type ProviderMeta = {
  providerId: string;
  providerName: string;
};

export function normalizeNativeToken(token: string, nativeAddress = NATIVE_TOKEN_ADDRESS): string {
  return token === "ETH" ? nativeAddress : token;
}

export function toSlippagePercent(slippageBps: number | undefined): string {
  const bps = typeof slippageBps === "number" ? slippageBps : 100;
  return trimDecimal(String(bps / 100));
}

export function toMinAmount(amount: string, slippageBps: number | undefined): string {
  if (!/^\d+$/.test(amount)) return "";
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.round(slippageBps ?? 100))));
  return ((BigInt(amount) * (10_000n - bps)) / 10_000n).toString();
}

export function normalizeQuote(
  params: QuoteParams,
  meta: ProviderMeta,
  fields: {
    buyAmount: string;
    minBuyAmount?: string;
    to: string;
    data: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    totalNetworkFee?: string;
    networkFeeToken?: QuoteResponse["networkFeeToken"];
    executionKind?: QuoteResponse["executionKind"];
    allowanceTarget?: string;
    routeLines?: QuoteRouteLine[];
    serviceFees?: QuoteFee[];
    platformFeeBps?: number;
  }
): QuoteResponse {
  // Provider buy amounts are executable, post-fee amounts. Fee objects are a
  // disclosure of deductions already encoded in the returned transaction.
  const netBuyAmount = fields.buyAmount;
  const grossBuyAmount = addIntegerStrings(netBuyAmount, sumFeesInToken(fields.serviceFees ?? [], params.buyToken));
  const quote: QuoteResponse = {
    quoteId: buildQuoteId(meta.providerId, params, fields.to, grossBuyAmount),
    providerId: meta.providerId,
    providerName: meta.providerName,
    fromChainId: params.chainId,
    toChainId: params.buyChainId ?? params.chainId,
    platformFeeBps: fields.platformFeeBps,
    sellAmount: params.sellAmount,
    buyAmount: netBuyAmount,
    grossBuyAmount,
    netBuyAmount,
    minBuyAmount: fields.minBuyAmount,
    to: fields.to,
    data: fields.data,
    value: fields.value ?? "0",
    gas: fields.gas,
    gasPrice: fields.gasPrice,
    totalNetworkFee: fields.totalNetworkFee,
    networkFeeToken: fields.networkFeeToken,
    executionKind: fields.executionKind ?? (
      (params.buyChainId ?? params.chainId) === params.chainId ? "evm-same-chain" : "evm-cross-chain"
    ),
    allowanceTarget: fields.allowanceTarget,
    routeLines: fields.routeLines ?? [],
    serviceFees: fields.serviceFees ?? []
  };

  return quote;
}

export function sanitizeQuoteForList(quote: QuoteResponse): QuoteResponse {
  const { availableQuotes: _availableQuotes, quoteErrors: _quoteErrors, ...rest } = quote;
  return rest;
}

export function rankQuotes(quotes: QuoteResponse[]): QuoteResponse[] {
  return [...quotes].sort((a, b) => compareIntegerStrings(getComparableBuyAmount(b), getComparableBuyAmount(a)));
}

export function getComparableBuyAmount(quote: QuoteResponse): string {
  return stringValue(quote.netBuyAmount) || stringValue(quote.buyAmount);
}

export function providerError(providerId: string, providerName: string, error: unknown) {
  return {
    providerId,
    providerName,
    message: normalizeProviderError(error),
    status: getProviderErrorStatus(error)
  };
}

export function normalizeProviderError(error: unknown): string {
  const status = getProviderErrorStatus(error);
  if (status === 429) return "This route is busy. Try again shortly.";
  if (status === 400 || status === 404 || status === 422) {
    return "No route is available for these swap details.";
  }
  return "This route is temporarily unavailable.";
}

export function getProviderErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const status = Number((error as { status?: unknown }).status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}

export function assertExecutableQuote(
  params: QuoteParams,
  fields: {
    buyAmount?: string;
    minBuyAmount?: string;
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    totalNetworkFee?: string;
    allowanceTarget?: string;
  },
  options: { quoteOnly?: boolean } = {}
) {
  const buyAmount = requireUint(fields.buyAmount, "output amount", true);
  if (fields.minBuyAmount) {
    const minBuyAmount = requireUint(fields.minBuyAmount, "minimum output amount", true);
    if (minBuyAmount > buyAmount) {
      throw new Error("Provider returned a minimum output above its quoted output.");
    }
  }

  if (options.quoteOnly) return;

  if (!isEvmAddress(fields.to) || isZeroAddress(fields.to)) {
    throw new Error("Provider did not return a valid swap contract.");
  }
  if (!isHexData(fields.data) || fields.data!.length > MAX_CALLDATA_HEX_LENGTH) {
    throw new Error("Provider did not return valid swap transaction data.");
  }

  const sellAmount = requireUint(params.sellAmount, "sell amount", true);
  const transactionValue = requireUint(fields.value ?? "0", "transaction value");
  const expectedValue = params.sellToken === "ETH" ? sellAmount : 0n;
  if (transactionValue !== expectedValue) {
    throw new Error("Provider returned an unexpected transaction value.");
  }
  if (params.sellToken !== "ETH" && fields.data === "0x") {
    throw new Error("Provider did not return token swap transaction data.");
  }

  if (fields.allowanceTarget && (!isEvmAddress(fields.allowanceTarget) || isZeroAddress(fields.allowanceTarget))) {
    throw new Error("Provider returned an invalid token approval contract.");
  }
  if (fields.gas) {
    const gas = requireUint(fields.gas, "gas estimate", true);
    if (gas > MAX_GAS_UNITS) throw new Error("Provider returned an unsafe gas estimate.");
  }
  if (fields.gasPrice) requireUint(fields.gasPrice, "gas price");
  if (fields.totalNetworkFee) requireUint(fields.totalNetworkFee, "network fee");
}

export function parseJsonBody(text: string): Record<string, unknown> {
  try {
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return recordValue(parsed);
  } catch {
    return { raw: text };
  }
}

export async function readProviderResponse(res: Response, providerName: string): Promise<Record<string, unknown>> {
  const body = parseJsonBody(await readProviderResponseText(res, providerName));
  if (!res.ok) {
    const nestedError = recordValue(body.error);
    const msg =
      stringValue(nestedError.message) ||
      stringValue(body.error) ||
      stringValue(body.message) ||
      stringValue(body.detail) ||
      stringValue(body.reason) ||
      `${providerName} quote unavailable (${res.status})`;
    throw Object.assign(new Error(msg), { status: res.status, body });
  }
  return body;
}

async function readProviderResponseText(res: Response, providerName: string): Promise<string> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw providerResponseTooLarge(providerName);
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw providerResponseTooLarge(providerName);
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function providerResponseTooLarge(providerName: string): Error & { status: number } {
  return Object.assign(new Error(`${providerName} response exceeded the safe size limit.`), { status: 502 });
}

export function collectNestedProtocolLines(value: unknown): QuoteRouteLine[] {
  const totals = new Map<string, number>();

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const item = recordValue(node);
    if (Object.keys(item).length === 0) return;
    const name =
      stringValue(item.name) ||
      stringValue(item.title) ||
      stringValue(item.id) ||
      stringValue(item.exchange) ||
      stringValue(item.source);
    const proportionBps = numberValue(item.proportionBps);
    const part = proportionBps > 0
      ? proportionBps / 100
      : numberValue(item.part ?? item.share ?? item.percent ?? item.percentage);
    if (name) totals.set(name, (totals.get(name) ?? 0) + (part || 0));

    Object.values(item).forEach((child) => {
      if (Array.isArray(child)) visit(child);
    });
  }

  visit(value);

  return Array.from(totals.entries())
    .slice(0, 5)
    .map(([source, part]) => ({
      source,
      share: part > 0 ? `${trimDecimal(String(part))}%` : "Best route"
    }));
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function uintStringValue(value: unknown): string {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : "";
  }
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (/^\d{1,78}$/.test(normalized)) return normalized;
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(normalized)) return "";
  try {
    return BigInt(normalized).toString();
  } catch {
    return "";
  }
}

export function scalarStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function recordValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildQuoteId(providerId: string, params: QuoteParams, to: string, buyAmount: string): string {
  return `${providerId}:${params.chainId}:${params.buyChainId ?? params.chainId}:${params.sellToken}:${params.buyToken}:${params.sellAmount}:${buyAmount}:${to}`;
}

function compareIntegerStrings(a: string, b: string): number {
  if (!/^\d+$/.test(a) && !/^\d+$/.test(b)) return 0;
  if (!/^\d+$/.test(a)) return -1;
  if (!/^\d+$/.test(b)) return 1;
  const left = BigInt(a);
  const right = BigInt(b);
  return left > right ? 1 : left < right ? -1 : 0;
}

function sumFeesInToken(fees: QuoteFee[], tokenAddress: string): string {
  const target = normalizeTokenKey(tokenAddress);
  return fees
    .reduce((sum, fee) => {
      if (normalizeTokenKey(fee.token) !== target || !/^\d+$/.test(fee.amount)) return sum;
      return sum + BigInt(fee.amount);
    }, 0n)
    .toString();
}

function addIntegerStrings(value: string, addition: string): string {
  if (!/^\d+$/.test(value) || !/^\d+$/.test(addition)) return value;
  return (BigInt(value) + BigInt(addition)).toString();
}

function normalizeTokenKey(token: string): string {
  const key = token.trim().toLowerCase();
  return key === "eth" ? NATIVE_TOKEN_ADDRESS.toLowerCase() : key;
}

function trimDecimal(value: string): string {
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function requireUint(value: string | undefined, label: string, positive = false): bigint {
  if (!value || !/^\d{1,78}$/.test(value)) {
    throw new Error(`Provider returned an invalid ${label}.`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX || (positive && parsed === 0n)) {
    throw new Error(`Provider returned an invalid ${label}.`);
  }
  return parsed;
}

function isEvmAddress(value: string | undefined): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isZeroAddress(value: string): boolean {
  return /^0x0{40}$/i.test(value);
}

function isHexData(value: string | undefined): value is string {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}
