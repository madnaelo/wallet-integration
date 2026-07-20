import { NextRequest, NextResponse } from "next/server";
import { isSwapChainAllowed } from "@/lib/chains";
import { getAddressFamilyForChain } from "@/lib/ecosystems";
import { env } from "@/lib/server/env";
import { getClientIp } from "@/lib/server/ip";
import { getLifiTransferStatus } from "@/lib/server/lifiStatusClient";
import { getProviderErrorStatus } from "@/lib/server/quoteNormalization";
import { rateLimitMany } from "@/lib/server/rateLimit";
import { applyCorsHeaders, evaluateRequestOrigin } from "@/lib/server/requestOrigin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const origin = evaluateRequestOrigin(request);
  if (!origin.allowed) {
    return withCors(NextResponse.json({ error: "This request cannot be completed from this site." }, { status: 403 }), origin.responseOrigin);
  }

  const params = new URL(request.url).searchParams;
  const transactionHash = (params.get("transactionHash") ?? "").trim();
  const fromChainId = parseChainId(params.get("fromChainId"));
  const toChainId = parseChainId(params.get("toChainId"));
  const bridge = (params.get("bridge") ?? "").trim();
  if (
    !isSwapChainAllowed(fromChainId)
    || !isSwapChainAllowed(toChainId)
    || !isTransactionHashForChain(transactionHash, fromChainId)
    || (bridge && !/^[A-Za-z0-9._:-]{1,80}$/.test(bridge))
  ) {
    return withCors(NextResponse.json({ error: "This swap status request is invalid." }, { status: 400 }), origin.responseOrigin);
  }

  const limit = await rateLimitMany([
    `route-status-ip:${getClientIp(request) ?? "unknown"}`,
    `route-status-tx:${transactionHash}`
  ]);
  if (limit.unavailable) {
    return withCors(NextResponse.json({ error: "Swap status is temporarily unavailable." }, { status: 503 }), origin.responseOrigin);
  }
  if (!limit.allowed) {
    return withCors(NextResponse.json(
      { error: "Swap status is being checked too quickly. Wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    ), origin.responseOrigin);
  }

  try {
    const status = await getLifiTransferStatus(
      { baseUrl: env.LIFI_BASE_URL, apiKey: env.LIFI_API_KEY },
      { transactionHash, fromChainId, toChainId, bridge: bridge || undefined }
    );
    return withCors(NextResponse.json(status), origin.responseOrigin);
  } catch (error) {
    const providerStatus = getProviderErrorStatus(error);
    console.warn({
      event: "route_status_failed",
      fromChainId,
      toChainId,
      providerStatus,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    const response = NextResponse.json(
      {
        error: providerStatus === 429
          ? "Swap status checks are busy right now. Wait a moment and try again."
          : "Swap status is temporarily unavailable."
      },
      { status: providerStatus === 429 ? 429 : 503 }
    );
    if (providerStatus === 429) response.headers.set("Retry-After", "10");
    return withCors(response, origin.responseOrigin);
  }
}

function parseChainId(value: string | null): number {
  if (!value || !/^\d{1,16}$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function isTransactionHashForChain(value: string, chainId: number): boolean {
  const family = getAddressFamilyForChain(chainId);
  if (family === "bitcoin") return /^[0-9a-fA-F]{64}$/.test(value);
  if (family === "solana") return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value);
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function withCors(response: NextResponse, origin: string | null) {
  applyCorsHeaders(response.headers, origin);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
