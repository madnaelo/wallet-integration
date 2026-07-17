import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/ip";
import { rateLimit } from "@/lib/server/rateLimit";
import { quoteCache } from "@/lib/server/cache";
import { getAllowedChainIds, getChainById, isChainAllowed } from "@/lib/chains";
import { isAddress, isPositiveIntegerString } from "@/lib/validation";
import { env } from "@/lib/server/env";
import type { QuoteResponse } from "@/lib/types";
import { createNativeBitcoinQuoteClient, createQuoteClient } from "@/lib/server/quoteProvider";
import { getProviderErrorStatus } from "@/lib/server/quoteNormalization";
import { isNativeBitcoinToken, type TokenInfo } from "@/lib/tokens";
import { getTokensForChain } from "@/lib/server/tokenRegistry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "unknown";

  const corsOrigin = req.headers.get("origin");
  if (!isOriginAllowed(corsOrigin)) {
    return NextResponse.json({ error: "CORS origin not allowed." }, { status: 403 });
  }

  const rl = await rateLimit(ip);
  if (rl.unavailable) {
    return withCors(
      NextResponse.json({ error: "Quotes are temporarily unavailable. Please try again shortly." }, { status: 503 }),
      corsOrigin
    );
  }
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
  const toAddress = (searchParams.get("toAddress") ?? "").trim();
  const slippageBpsStr = searchParams.get("slippageBps") ?? "";

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

  const isSellTokenOk = sellToken === "ETH" || isAddress(sellToken) || isNativeBitcoinToken(sellToken);
  const isBuyTokenOk = buyToken === "ETH" || isAddress(buyToken) || isNativeBitcoinToken(buyToken);

  if (!isSellTokenOk || !isBuyTokenOk) {
    return withCors(
      NextResponse.json({ error: "Invalid token address." }, { status: 400 }),
      corsOrigin
    );
  }

  if (!/^\d+$/.test(sellAmount)) {
    return withCors(
      NextResponse.json({ error: "Enter a valid amount." }, { status: 400 }),
      corsOrigin
    );
  }
  if (sellAmount.length > 78) {
    return withCors(NextResponse.json({ error: "sellAmount is too large." }, { status: 400 }), corsOrigin);
  }
  if (!isPositiveIntegerString(sellAmount)) {
    return withCors(
      NextResponse.json({ error: "sellAmount must be greater than zero." }, { status: 400 }),
      corsOrigin
    );
  }

  if (isNativeBitcoinToken(sellToken)) {
    if (!isBitcoinAddressInput(takerAddress)) {
      return withCors(NextResponse.json({ error: "Invalid Bitcoin source address." }, { status: 400 }), corsOrigin);
    }
  } else if (!isAddress(takerAddress)) {
    return withCors(NextResponse.json({ error: "Invalid source wallet address." }, { status: 400 }), corsOrigin);
  }

  if (isNativeBitcoinToken(buyToken)) {
    if (!isBitcoinAddressInput(toAddress)) {
      return withCors(NextResponse.json({ error: "Choose a Bitcoin receive address." }, { status: 400 }), corsOrigin);
    }
  } else if (toAddress && !isAddress(toAddress)) {
    return withCors(NextResponse.json({ error: "Invalid receive address." }, { status: 400 }), corsOrigin);
  } else if (isNativeBitcoinToken(sellToken) && !toAddress) {
    return withCors(NextResponse.json({ error: "Choose a receive address." }, { status: 400 }), corsOrigin);
  }

  const walletLimit = await rateLimit(`quote-wallet:${normalizeTokenKey(takerAddress)}`);
  if (walletLimit.unavailable) {
    return withCors(
      NextResponse.json({ error: "Quotes are temporarily unavailable. Please try again shortly." }, { status: 503 }),
      corsOrigin
    );
  }
  if (!walletLimit.allowed) {
    return withCors(
      NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(walletLimit.retryAfterMs / 1000)) } }
      ),
      corsOrigin
    );
  }

  let slippageBps: number | undefined;
  if (slippageBpsStr) {
    if (!/^\d+$/.test(slippageBpsStr)) {
      return withCors(NextResponse.json({ error: "Invalid slippageBps." }, { status: 400 }), corsOrigin);
    }
    slippageBps = Number(slippageBpsStr);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
      return withCors(NextResponse.json({ error: "slippageBps must be between 0 and 10000." }, { status: 400 }), corsOrigin);
    }
  }

  const chain = getChainById(chainId);
  if (!chain) {
    return withCors(NextResponse.json({ error: "Chain registry missing configuration." }, { status: 500 }), corsOrigin);
  }

  const sellTokenInfo = await resolveTokenInfo(chainId, sellToken);
  const buyTokenInfo = await resolveTokenInfo(chainId, buyToken);
  if (!sellTokenInfo || !buyTokenInfo) {
    return withCors(NextResponse.json({ error: "Token is not available on this network." }, { status: 400 }), corsOrigin);
  }
  const cacheKey = [
    "quote",
    chainId,
    normalizeTokenKey(sellToken),
    normalizeTokenKey(buyToken),
    sellAmount,
    normalizeTokenKey(takerAddress),
    normalizeTokenKey(toAddress),
    slippageBps ?? "default"
  ].join(":");
  const cached = quoteCache.get(cacheKey);
  if (cached) {
    return withCors(NextResponse.json(cached, { status: 200 }), corsOrigin);
  }

  try {
    const isBitcoinSwap = isNativeBitcoinToken(sellTokenInfo) || isNativeBitcoinToken(buyTokenInfo);
    const client = isBitcoinSwap ? createNativeBitcoinQuoteClient() : createQuoteClient(chain);

    const quote = await client.getQuote({
      sellToken,
      sellTokenSymbol: sellTokenInfo.symbol,
      sellTokenDecimals: sellTokenInfo.decimals,
      buyToken,
      buyTokenSymbol: buyTokenInfo.symbol,
      buyTokenDecimals: buyTokenInfo.decimals,
      sellAmount,
      takerAddress,
      toAddress: toAddress || undefined,
      chainId,
      slippageBps
    });

    quoteCache.set(cacheKey, quote);

    return withCors(NextResponse.json(quote, { status: 200 }), corsOrigin);
  } catch (error: unknown) {
    const providerStatus = getProviderErrorStatus(error);
    console.warn({
      event: "quote_request_failed",
      chainId,
      providerStatus,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    const message =
      providerStatus === 429
        ? "Quotes are busy right now. Please try again shortly."
        : providerStatus === 400 || providerStatus === 404 || providerStatus === 422
          ? "No swap route is available for these details."
          : "Quotes are temporarily unavailable. Please try again shortly.";
    return withCors(NextResponse.json({ error: message }, { status: 502 }), corsOrigin);
  }
}

function isOriginAllowed(origin: string | null): boolean {
  const allow = env.CORS_ALLOW_ORIGINS;
  if (!allow || allow.trim().length === 0) return true;
  const parts = allow.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.includes("*")) return true;
  if (!origin) return !env.REQUIRE_ALLOWED_ORIGIN;
  return parts.includes(origin);
}

async function resolveTokenInfo(chainId: number, address: string): Promise<TokenInfo | null> {
  const tokens = await getTokensForChain(chainId);
  const normalized = normalizeTokenKey(address);
  return tokens.find((token) => normalizeTokenKey(token.address) === normalized) ?? null;
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}

function isBitcoinAddressInput(value: string): boolean {
  const address = value.trim();
  return (
    /^(bc1)[ac-hj-np-z02-9]{11,87}$/i.test(address) ||
    /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)
  );
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
