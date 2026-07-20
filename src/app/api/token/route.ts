import { NextRequest, NextResponse } from "next/server";
import { isSwapChainAllowed } from "@/lib/chains";
import { getAddressFamilyForChain } from "@/lib/ecosystems";
import { getClientIp } from "@/lib/server/ip";
import { rateLimitMany } from "@/lib/server/rateLimit";
import { evaluateRequestOrigin } from "@/lib/server/requestOrigin";
import { getProviderErrorStatus } from "@/lib/server/quoteNormalization";
import { resolveTokenForChain } from "@/lib/server/tokenRegistry";
import { isAddress, isSolanaAddress } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!evaluateRequestOrigin(request).allowed) {
    return response({ error: "This request cannot be completed from this site." }, 403);
  }

  const params = new URL(request.url).searchParams;
  const chainId = parseChainId(params.get("chainId"));
  const address = (params.get("address") ?? "").trim();
  if (!isSwapChainAllowed(chainId) || !isTokenAddressForChain(address, chainId)) {
    return response({ error: "Choose a valid token address and network." }, 400);
  }

  const limit = await rateLimitMany([
    `token-address-ip:${getClientIp(request) ?? "unknown"}`,
    `token-address:${chainId}:${normalizeAddress(address)}`
  ]);
  if (limit.unavailable) {
    return response({ error: "Token search is temporarily unavailable." }, 503);
  }
  if (!limit.allowed) {
    return response(
      { error: "Token searches are being made too quickly. Wait a moment and try again." },
      429,
      { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) }
    );
  }

  try {
    const token = await resolveTokenForChain(chainId, address);
    if (!token) return response({ error: "No token was found at this address on the selected network." }, 404);
    return response({ token }, 200);
  } catch (error) {
    const providerStatus = getProviderErrorStatus(error);
    console.warn({
      event: "token_address_lookup_failed",
      chainId,
      providerStatus,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return response(
      {
        error: providerStatus === 429
          ? "Token search is busy right now. Wait a moment and try again."
          : "Token search is temporarily unavailable."
      },
      providerStatus === 429 ? 429 : 503,
      providerStatus === 429 ? { "Retry-After": "10" } : undefined
    );
  }
}

function parseChainId(value: string | null): number {
  if (!value || !/^\d{1,16}$/.test(value)) return Number.NaN;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function isTokenAddressForChain(address: string, chainId: number): boolean {
  const family = getAddressFamilyForChain(chainId);
  if (family === "solana") return isSolanaAddress(address);
  if (family === "evm") return isAddress(address);
  return false;
}

function normalizeAddress(address: string): string {
  return isAddress(address) ? address.toLowerCase() : address;
}

function response(body: object, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200
        ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
        : "private, no-store, max-age=0",
      ...headers
    }
  });
}
