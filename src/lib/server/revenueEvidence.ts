import { createHash, createHmac, randomUUID } from "node:crypto";
import type { QuoteParams, ProviderOutcome } from "@/lib/server/aggregator";
import type { QuoteResponse } from "@/lib/types";
import { createPlatformFeeConfig } from "@/lib/server/platformFees";
import { env } from "@/lib/server/env";

export function revenueEnabled(): boolean {
  return process.env.REVENUE_ENABLED === "true";
}

export function evidenceHash(data: string): string {
  return createHash("sha256").update(/^0x[0-9a-f]*$/i.test(data) ? data.toLowerCase() : data).digest("hex");
}

export function signRevenuePayload(payload: string, secret: string): string {
  if (!secret.trim() || secret.length < 32) throw new Error("Revenue ingestion secret is missing or too short.");
  return createHmac("sha256", secret).update("swap-revenue-v1\n" + payload).digest("hex");
}

function assetKey(token: string): string {
  if (token === "ETH" || /^(0x0{40}|0xe{40})$/i.test(token)) return "native";
  return /^0x[0-9a-f]{40}$/i.test(token) ? token.toLowerCase() : token;
}

function canonicalAsset(token: string): string {
  return assetKey(token) === "native" ? "ETH" : assetKey(token);
}

export function buildRevenueSnapshot(quote: QuoteResponse, params: QuoteParams, owner: string) {
  if (!["0x", "lifi"].includes(quote.providerId ?? "") || !/^0x[0-9a-f]{40}$/i.test(owner)) return null;
  const fees = quote.serviceFees?.filter((fee) => fee.kind === "platform") ?? [];
  if (fees.length !== 1 || assetKey(fees[0]!.token) !== assetKey(params.sellToken)) {
    throw new Error("Cannot establish the quoted platform fee basis.");
  }
  const fee = fees[0]!;
  return {
    id: randomUUID(), provider: quote.providerId, providerQuoteId: quote.providerQuoteId ?? "",
    bridge: quote.bridgeTool ?? "", executionKind: quote.executionKind,
    sourceChain: params.chainId, destinationChain: params.buyChainId ?? params.chainId,
    owner: owner.toLowerCase(), taker: params.takerAddress, recipient: params.toAddress ?? params.takerAddress,
    sellToken: { address: canonicalAsset(params.sellToken), symbol: params.sellTokenSymbol, decimals: params.sellTokenDecimals },
    buyToken: { address: canonicalAsset(params.buyToken), symbol: params.buyTokenSymbol, decimals: params.buyTokenDecimals },
    feeToken: { address: canonicalAsset(fee.token), symbol: params.sellTokenSymbol, decimals: params.sellTokenDecimals },
    sellAmount: quote.sellAmount, buyAmount: quote.buyAmount, minimumAmount: quote.minBuyAmount ?? "0",
    feeBps: quote.platformFeeBps, expectedFee: fee.amount,
    beneficiary: quote.providerId === "0x" ? createPlatformFeeConfig().recipient : env.LIFI_INTEGRATOR,
    feeBasis: quote.providerId === "0x" ? "sell_amount_floor" : "provider_allocation",
    transactionTo: quote.to, transactionValue: quote.value ?? "0", dataHash: evidenceHash(quote.data)
  };
}

// Called only on the server after provider validation. The browser receives
// opaque evidence IDs, never the ingestion secret or a trusted accounting API.
export async function captureRevenueEvidence(
  quote: QuoteResponse | null, params: QuoteParams, owner: string, outcomes: ProviderOutcome[]
): Promise<void> {
  if (!revenueEnabled()) return;
  const candidates = quote ? (quote.availableQuotes?.length ? quote.availableQuotes : [quote]) : [];
  const snapshots = candidates.map((candidate) => ({ candidate, snapshot: buildRevenueSnapshot(candidate, params, owner) }));
  const payload = JSON.stringify({
    id: randomUUID(), version: 1, issuedAt: Date.now(),
    quotes: snapshots.flatMap(({ snapshot }) => snapshot ? [snapshot] : []), outcomes
  });
  const base = process.env.REVENUE_BACKEND_URL ?? "";
  const url = new URL("/api/internal/revenue/quotes", base);
  if (url.username || url.password || url.hash) throw new Error("Invalid revenue backend URL.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "backend"].includes(url.hostname))) {
    throw new Error("Revenue backend must use HTTPS outside local development.");
  }
  const signature = signRevenuePayload(payload, process.env.REVENUE_INGEST_SECRET ?? "");
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payload, signature }),
    signal: AbortSignal.timeout(6000), cache: "no-store", redirect: "error"
  });
  if (!response.ok) throw new Error("Revenue evidence storage is unavailable.");
  for (const { candidate, snapshot } of snapshots) {
    if (snapshot) candidate.revenueQuoteId = snapshot.id;
  }
  if (quote?.availableQuotes?.length) {
    quote.revenueQuoteId = quote.availableQuotes.find((candidate) => candidate.quoteId === quote.quoteId)?.revenueQuoteId;
  }
}
