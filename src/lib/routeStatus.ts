import type { QuoteResponse, RouteStatusResponse } from "@/lib/types";

export function shouldTrackRoute(quote: QuoteResponse): boolean {
  return quote.providerId === "lifi"
    && typeof quote.fromChainId === "number"
    && typeof quote.toChainId === "number"
    && quote.fromChainId !== quote.toChainId;
}

export async function fetchRouteStatus(
  quote: QuoteResponse,
  transactionHash: string,
  signal?: AbortSignal
): Promise<RouteStatusResponse> {
  if (!shouldTrackRoute(quote)) throw new Error("This route does not need delivery tracking.");
  const params = new URLSearchParams({
    transactionHash,
    fromChainId: String(quote.fromChainId),
    toChainId: String(quote.toChainId)
  });
  if (quote.bridgeTool) params.set("bridge", quote.bridgeTool);

  const response = await fetch(`/api/route-status?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal
  });
  const body = await response.json().catch(() => ({})) as Partial<RouteStatusResponse> & { error?: string };
  if (!response.ok) throw new Error(body.error || "Swap status is temporarily unavailable.");
  if (!body.state || !body.message || !body.providerStatus) {
    throw new Error("Swap status is temporarily unavailable.");
  }
  return body as RouteStatusResponse;
}

export function routeStatusDelayMs(attempt: number): number {
  if (attempt < 6) return 10_000;
  if (attempt < 12) return 30_000;
  return 60_000;
}
