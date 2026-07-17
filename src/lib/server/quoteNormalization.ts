import type { QuoteFee, QuoteResponse, QuoteRouteLine } from "@/lib/types";
import type { QuoteParams } from "@/lib/server/aggregator";

export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
  body: Record<string, unknown>,
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
    ...body,
    quoteId: buildQuoteId(meta.providerId, params, fields.to, grossBuyAmount),
    providerId: meta.providerId,
    providerName: meta.providerName,
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
    allowanceTarget: fields.allowanceTarget,
    routeLines: fields.routeLines ?? [],
    serviceFees: fields.serviceFees ?? []
  };

  if (fields.gasPrice) {
    quote.transaction = {
      ...(typeof body.transaction === "object" && body.transaction ? body.transaction : {}),
      gasPrice: fields.gasPrice
    };
  }

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

export function assertExecutableQuote(fields: { to?: string; data?: string }) {
  if (!fields.to || !fields.data) throw new Error("Provider did not return executable swap data.");
}

export function parseJsonBody(text: string): Record<string, unknown> {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function readProviderResponse(res: Response, providerName: string): Promise<Record<string, unknown>> {
  const body = parseJsonBody(await res.text());
  if (!res.ok) {
    const msg =
      stringValue((body as any)?.error?.message) ||
      stringValue((body as any)?.error) ||
      stringValue((body as any)?.message) ||
      stringValue((body as any)?.detail) ||
      stringValue((body as any)?.reason) ||
      `${providerName} quote unavailable (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function collectNestedProtocolLines(value: unknown): QuoteRouteLine[] {
  const totals = new Map<string, number>();

  function visit(node: unknown) {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (!node || typeof node !== "object") return;
    const item: any = node;
    const name = stringValue(item.name) || stringValue(item.title) || stringValue(item.id) || stringValue(item.exchange);
    const part = numberValue(item.part ?? item.share ?? item.percent ?? item.percentage);
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

export function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function buildQuoteId(providerId: string, params: QuoteParams, to: string, buyAmount: string): string {
  return `${providerId}:${params.chainId}:${params.sellToken}:${params.buyToken}:${params.sellAmount}:${buyAmount}:${to}`;
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
