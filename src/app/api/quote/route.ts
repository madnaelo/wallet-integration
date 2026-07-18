import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/ip";
import { rateLimitMany } from "@/lib/server/rateLimit";
import { quoteCache } from "@/lib/server/cache";
import { getChainById, isChainAllowed } from "@/lib/chains";
import { isAddress, isBitcoinMainnetAddress, isPositiveIntegerString } from "@/lib/validation";
import type { QuoteResponse } from "@/lib/types";
import { createNativeBitcoinQuoteClient, createQuoteClient } from "@/lib/server/quoteProvider";
import { getProviderErrorStatus } from "@/lib/server/quoteNormalization";
import { isNativeBitcoinToken, type TokenInfo } from "@/lib/tokens";
import { getTokensForChain } from "@/lib/server/tokenRegistry";
import { parseQuoteSlippageBps } from "@/lib/server/quoteRequestValidation";
import { applyCorsHeaders, evaluateRequestOrigin } from "@/lib/server/requestOrigin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req) ?? "unknown";
  const originDecision = evaluateRequestOrigin(req);
  if (!originDecision.allowed) {
    return withCors(
      NextResponse.json({ error: "This request cannot be completed from this site." }, { status: 403 }),
      originDecision.responseOrigin
    );
  }
  const corsOrigin = originDecision.responseOrigin;

  const { searchParams } = new URL(req.url);
  const takerAddress = searchParams.get("takerAddress") ?? "";
  const rl = await rateLimitMany([
    `quote-ip:${ip}`,
    `quote-wallet:${normalizeTokenKey(takerAddress) || "missing"}`
  ]);
  if (rl.unavailable) {
    return withCors(
      NextResponse.json({ error: "Quotes are temporarily unavailable. Please try again shortly." }, { status: 503 }),
      corsOrigin
    );
  }
  if (!rl.allowed) {
    return withCors(
      NextResponse.json(
        { error: "Quotes are being refreshed too quickly. Wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      ),
      corsOrigin
    );
  }

  const chainIdStr = searchParams.get("chainId") ?? "";
  const sellToken = searchParams.get("sellToken") ?? "";
  const buyToken = searchParams.get("buyToken") ?? "";
  const sellAmount = searchParams.get("sellAmount") ?? "";
  const toAddress = (searchParams.get("toAddress") ?? "").trim();
  const slippageBpsStr = searchParams.get("slippageBps") ?? "";

  if (!chainIdStr || !/^\d+$/.test(chainIdStr)) {
    return withCors(NextResponse.json({ error: "Choose a valid network." }, { status: 400 }), corsOrigin);
  }
  const chainId = Number(chainIdStr);

  if (!isChainAllowed(chainId)) {
    return withCors(
      NextResponse.json({ error: "This network is not supported yet." }, { status: 400 }),
      corsOrigin
    );
  }

  if (!sellToken || !buyToken) {
    return withCors(
      NextResponse.json({ error: "Choose both tokens." }, { status: 400 }),
      corsOrigin
    );
  }

  const isSellTokenOk = sellToken === "ETH" || isAddress(sellToken) || isNativeBitcoinToken(sellToken);
  const isBuyTokenOk = buyToken === "ETH" || isAddress(buyToken) || isNativeBitcoinToken(buyToken);

  if (!isSellTokenOk || !isBuyTokenOk) {
    return withCors(
      NextResponse.json({ error: "Choose a valid token." }, { status: 400 }),
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
    return withCors(NextResponse.json({ error: "Enter a smaller amount." }, { status: 400 }), corsOrigin);
  }
  if (!isPositiveIntegerString(sellAmount)) {
    return withCors(
      NextResponse.json({ error: "Enter an amount greater than zero." }, { status: 400 }),
      corsOrigin
    );
  }

  if (isNativeBitcoinToken(sellToken)) {
    if (!isBitcoinMainnetAddress(takerAddress)) {
      return withCors(NextResponse.json({ error: "Invalid Bitcoin source address." }, { status: 400 }), corsOrigin);
    }
  } else if (!isAddress(takerAddress)) {
    return withCors(NextResponse.json({ error: "Invalid source wallet address." }, { status: 400 }), corsOrigin);
  }

  if (isNativeBitcoinToken(buyToken)) {
    if (!isBitcoinMainnetAddress(toAddress)) {
      return withCors(NextResponse.json({ error: "Choose a Bitcoin receive address." }, { status: 400 }), corsOrigin);
    }
  } else if (toAddress && !isAddress(toAddress)) {
    return withCors(NextResponse.json({ error: "Invalid receive address." }, { status: 400 }), corsOrigin);
  } else if (isNativeBitcoinToken(sellToken) && !toAddress) {
    return withCors(NextResponse.json({ error: "Choose a receive address." }, { status: 400 }), corsOrigin);
  }

  const slippage = parseQuoteSlippageBps(slippageBpsStr);
  if (!slippage.valid) {
    return withCors(NextResponse.json({ error: slippage.error }, { status: 400 }), corsOrigin);
  }
  const slippageBps = slippage.value;

  const chain = getChainById(chainId);
  if (!chain) {
    return withCors(NextResponse.json({ error: "This network is temporarily unavailable." }, { status: 500 }), corsOrigin);
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

async function resolveTokenInfo(chainId: number, address: string): Promise<TokenInfo | null> {
  const tokens = await getTokensForChain(chainId);
  const normalized = normalizeTokenKey(address);
  return tokens.find((token) => normalizeTokenKey(token.address) === normalized) ?? null;
}

function normalizeTokenKey(address: string): string {
  return address.trim().toLowerCase();
}

function withCors(res: NextResponse, origin: string | null) {
  applyCorsHeaders(res.headers, origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}
