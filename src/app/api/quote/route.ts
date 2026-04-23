import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/ip";
import { rateLimit } from "@/lib/server/rateLimit";
import { quoteCache } from "@/lib/server/cache";
import { getAllowedChainIds, getChainById, isChainAllowed } from "@/lib/chains";
import { isAddress, isPositiveIntegerString } from "@/lib/validation";
import { env } from "@/lib/server/env";
import type { QuoteResponse } from "@/lib/types";
import { ZeroXClient } from "@/lib/server/zeroxClient";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "unknown";

  const corsOrigin = req.headers.get("origin");
  if (!isOriginAllowed(corsOrigin)) {
    return NextResponse.json({ error: "CORS origin not allowed." }, { status: 403 });
  }

  const rl = rateLimit(ip);
  if (!rl.allowed) {
    return withCors(
      NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      ),
      corsOrigin
    );
  }

  const { searchParams } = new URL(req.url);

  const chainIdStr = searchParams.get("chainId") ?? "";
  const sellToken = searchParams.get("sellToken") ?? "";
  const buyToken = searchParams.get("buyToken") ?? "";
  const sellAmount = searchParams.get("sellAmount") ?? "";
  const takerAddress = searchParams.get("takerAddress") ?? "";

  if (!chainIdStr || !/^\d+$/.test(chainIdStr)) {
    return withCors(NextResponse.json({ error: "Invalid chainId." }, { status: 400 }), corsOrigin);
  }
  const chainId = Number(chainIdStr);

  if (!isChainAllowed(chainId)) {
    return withCors(
      NextResponse.json({ error: `Unsupported chainId. Allowed: ${getAllowedChainIds().join(", ")}` }, { status: 400 }),
      corsOrigin
    );
  }

  if (!sellToken || !buyToken) {
    return withCors(
      NextResponse.json({ error: "sellToken and buyToken are required." }, { status: 400 }),
      corsOrigin
    );
  }

  const isSellTokenOk = sellToken === "ETH" || isAddress(sellToken);
  const isBuyTokenOk = buyToken === "ETH" || isAddress(buyToken);

  if (!isSellTokenOk || !isBuyTokenOk) {
    return withCors(
      NextResponse.json({ error: "Invalid token address (or use ETH)." }, { status: 400 }),
      corsOrigin
    );
  }

  if (!isPositiveIntegerString(sellAmount)) {
    return withCors(
      NextResponse.json({ error: "sellAmount must be a positive integer string (base units)." }, { status: 400 }),
      corsOrigin
    );
  }

  if (!isAddress(takerAddress)) {
    return withCors(NextResponse.json({ error: "Invalid takerAddress." }, { status: 400 }), corsOrigin);
  }

  const chain = getChainById(chainId);
  if (!chain) {
    return withCors(NextResponse.json({ error: "Chain registry missing configuration." }, { status: 500 }), corsOrigin);
  }

  const cacheKey = `quote:${chainId}:${sellToken}:${buyToken}:${sellAmount}:${takerAddress}`;
  const cached = quoteCache.get(cacheKey);
  if (cached) {
    return withCors(NextResponse.json(cached, { status: 200 }), corsOrigin);
  }

  try {
    const client = new ZeroXClient({
      apiKey: env.ZEROX_API_KEY,
      baseUrl: chain.zeroXBaseUrl,
      affiliateAddress: env.AFFILIATE_ADDRESS,
      buyTokenPercentageFee: 0.002
    });

    const quote = await client.getQuote({
      sellToken,
      buyToken,
      sellAmount,
      takerAddress,
      chainId
    });

    quoteCache.set(cacheKey, quote);

    return withCors(NextResponse.json(quote, { status: 200 }), corsOrigin);
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 502;
    const message = e?.message || "Failed to fetch quote.";
    return withCors(NextResponse.json({ error: message }, { status }), corsOrigin);
  }
}

function isOriginAllowed(origin: string | null): boolean {
  const allow = env.CORS_ALLOW_ORIGINS;
  if (!allow || allow.trim().length === 0) return true;
  const parts = allow.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("*")) return true;
  if (!origin) return false;
  return parts.includes(origin);
}

function withCors(res: NextResponse, origin: string | null) {
  const allow = env.CORS_ALLOW_ORIGINS;
  const parts = allow.split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = parts.includes("*") ? "*" : origin && parts.includes(origin) ? origin : "";

  if (allowOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowOrigin);
    res.headers.set("Vary", "Origin");
  }
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return res;
}
