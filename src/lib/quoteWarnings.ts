import type { QuoteResponse } from "./types";

export function buildQuoteWarnings({
  quote,
  slippageBps,
  buyTokenFeesDeducted,
  grossBuyAmount
}: {
  quote: QuoteResponse;
  slippageBps: number | null;
  buyTokenFeesDeducted: string;
  grossBuyAmount: string;
}): string[] {
  const warnings: string[] = [];

  if (slippageBps !== null && slippageBps >= 300) {
    warnings.push(`Slippage is set to ${formatSlippageBps(slippageBps)}. The final amount can move before your wallet rejects the swap.`);
  }

  const platformFeeBps = quote.platformFeeBps ?? 0;
  const effectiveFeeBps = calculateBps(buyTokenFeesDeducted, grossBuyAmount);
  // These rates have different bases and may overlap. Never add them together.
  if (Number.isFinite(platformFeeBps) && platformFeeBps >= 100) {
    warnings.push(`Platform fee is ${formatFeeBps(platformFeeBps)}. Review the fee breakdown before swapping.`);
  } else if (effectiveFeeBps >= 100) {
    warnings.push(`Service fee is about ${formatFeeBps(effectiveFeeBps)} of the quoted output.`);
  }

  const quoteErrors = quote.quoteErrors ?? [];
  if (quoteErrors.length > 0) warnings.push(formatProviderWarning(quoteErrors));

  return warnings;
}

function calculateBps(numerator: string, denominator: string): number {
  if (!/^\d+$/.test(numerator) || !/^\d+$/.test(denominator)) return 0;
  const denominatorBigInt = BigInt(denominator);
  if (denominatorBigInt === 0n) return 0;
  const bps = (BigInt(numerator) * 10_000n) / denominatorBigInt;
  return bps > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(bps);
}

function formatProviderWarning(errors: QuoteResponse["quoteErrors"]): string {
  const providerNames = (errors ?? [])
    .map((error) => error.providerName || error.providerId)
    .filter((name): name is string => Boolean(name));
  const uniqueNames = Array.from(new Set(providerNames)).slice(0, 3);
  const suffix = uniqueNames.length ? `: ${uniqueNames.join(", ")}` : "";
  return `Some routes were unavailable${suffix}. The selected quote is still from a responding route.`;
}

export function formatFeeBps(feeBps: number): string {
  return `${(feeBps / 100).toLocaleString(undefined, { maximumFractionDigits: 4, maximumSignificantDigits: 10 })}%`;
}

export function formatSlippageBps(slippageBps: number): string {
  return `${formatSlippageBpsAsPercent(slippageBps)}%`;
}

export function formatSlippageBpsAsPercent(slippageBps: number): string {
  if (!Number.isFinite(slippageBps)) return "1";
  const pct = slippageBps / 100;
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}
