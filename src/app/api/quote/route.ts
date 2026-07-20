import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/server/ip";
import { rateLimitMany } from "@/lib/server/rateLimit";
import { quoteCache } from "@/lib/server/cache";
import { isSwapChainAllowed } from "@/lib/chains";
import { getAddressFamilyForChain } from "@/lib/ecosystems";
import { isAddress, isBitcoinMainnetAddress, isPositiveIntegerString, isSolanaAddress } from "@/lib/validation";
import type { QuoteResponse } from "@/lib/types";
import { createQuoteClient } from "@/lib/server/quoteProvider";
import { getProviderErrorStatus } from "@/lib/server/quoteNormalization";
import {
  isNativeBitcoinToken,
  NATIVE_BITCOIN_CHAIN_ID,
  NATIVE_BITCOIN_TOKEN,
  type TokenInfo
} from "@/lib/tokens";
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
    `quote-wallet:${normalizeWalletKey(takerAddress) || "missing"}`
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

  const sellToken = searchParams.get("sellToken") ?? "";
  const buyToken = searchParams.get("buyToken") ?? "";
  const sellAmount = searchParams.get("sellAmount") ?? "";
  const toAddress = (searchParams.get("toAddress") ?? "").trim();
  const slippageBpsStr = searchParams.get("slippageBps") ?? "";

  if (!sellToken || !buyToken) {
    return withCors(
      NextResponse.json({ error: "Choose both tokens." }, { status: 400 }),
      corsOrigin
    );
  }

  if (!/^\d+$/.test(sellAmount)) {
    return withCors(
      NextResponse.json({ error: "Enter a valid amount." }, { status: 400 }),
      corsOrigin
    );
  }

  const legacyChainId = searchParams.get("chainId") ?? "";
  const requestedFromChainId = parseChainId(searchParams.get("fromChainId") ?? legacyChainId);
  const requestedToChainId = parseChainId(searchParams.get("toChainId") ?? legacyChainId);
  const fromChainId = isNativeBitcoinToken(sellToken) ? NATIVE_BITCOIN_CHAIN_ID : requestedFromChainId;
  const toChainId = isNativeBitcoinToken(buyToken) ? NATIVE_BITCOIN_CHAIN_ID : requestedToChainId;

  if (!isSupportedAssetChain(fromChainId, sellToken) || !isSupportedAssetChain(toChainId, buyToken)) {
    return withCors(
      NextResponse.json({ error: "Choose a supported network for each token." }, { status: 400 }),
      corsOrigin
    );
  }
  if (
    fromChainId === toChainId &&
    normalizeAssetKey(sellToken, fromChainId) === normalizeAssetKey(buyToken, toChainId)
  ) {
    return withCors(NextResponse.json({ error: "Choose two different assets." }, { status: 400 }), corsOrigin);
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

  if (!isWalletAddressForChain(takerAddress, fromChainId)) {
    return withCors(NextResponse.json({ error: "Invalid source wallet address." }, { status: 400 }), corsOrigin);
  }

  if (!isWalletAddressForChain(toAddress, toChainId)) {
    return withCors(NextResponse.json({ error: "Invalid receive address." }, { status: 400 }), corsOrigin);
  }

  const slippage = parseQuoteSlippageBps(slippageBpsStr);
  if (!slippage.valid) {
    return withCors(NextResponse.json({ error: slippage.error }, { status: 400 }), corsOrigin);
  }
  const slippageBps = slippage.value;

  const sellTokenInfo = await resolveTokenInfo(fromChainId, sellToken);
  const buyTokenInfo = await resolveTokenInfo(toChainId, buyToken);
  if (!sellTokenInfo || !buyTokenInfo) {
    return withCors(NextResponse.json({ error: "Token is not available on this network." }, { status: 400 }), corsOrigin);
  }
  const cacheKey = [
    "quote",
    fromChainId,
    toChainId,
    normalizeAssetKey(sellToken, fromChainId),
    normalizeAssetKey(buyToken, toChainId),
    sellAmount,
    normalizeWalletKey(takerAddress),
    normalizeWalletKey(toAddress),
    slippageBps ?? "default"
  ].join(":");
  const cached = quoteCache.get(cacheKey);
  if (cached) {
    return withCors(NextResponse.json(cached, { status: 200 }), corsOrigin);
  }

  try {
    const client = createQuoteClient(fromChainId, toChainId);

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
      chainId: fromChainId,
      buyChainId: toChainId,
      slippageBps
    });

    quoteCache.set(cacheKey, quote);

    return withCors(NextResponse.json(quote, { status: 200 }), corsOrigin);
  } catch (error: unknown) {
    const providerStatus = getProviderErrorStatus(error);
    console.warn({
      event: "quote_request_failed",
      fromChainId,
      toChainId,
      providerStatus,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    const message =
      providerStatus === 429
        ? "Quotes are busy right now. Please try again shortly."
        : providerStatus === 400 || providerStatus === 404 || providerStatus === 422
          ? "No swap route is available for these details."
          : "Quotes are temporarily unavailable. Please try again shortly.";
    const responseStatus = providerStatus === 429
      ? 429
      : providerStatus === 400 || providerStatus === 404 || providerStatus === 422
        ? 422
        : 503;
    const response = NextResponse.json({ error: message }, { status: responseStatus });
    if (providerStatus === 429) response.headers.set("Retry-After", "10");
    return withCors(response, corsOrigin);
  }
}

async function resolveTokenInfo(chainId: number, address: string): Promise<TokenInfo | null> {
  if (chainId === NATIVE_BITCOIN_CHAIN_ID) {
    return isNativeBitcoinToken(address) ? NATIVE_BITCOIN_TOKEN : null;
  }
  const tokens = await getTokensForChain(chainId);
  const normalized = normalizeAssetKey(address, chainId);
  return tokens.find((token) => normalizeAssetKey(token.address, chainId) === normalized) ?? null;
}

function parseChainId(value: string): number {
  if (!/^\d{1,16}$/.test(value)) return Number.NaN;
  const chainId = Number(value);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : Number.NaN;
}

function isSupportedAssetChain(chainId: number, token: string): boolean {
  if (!Number.isSafeInteger(chainId) || !isSwapChainAllowed(chainId)) return false;
  const family = getAddressFamilyForChain(chainId);
  if (family === "bitcoin") return isNativeBitcoinToken(token);
  if (family === "solana") return isSolanaAddress(token);
  return token === "ETH" || isAddress(token);
}

function isWalletAddressForChain(address: string, chainId: number): boolean {
  const family = getAddressFamilyForChain(chainId);
  if (family === "bitcoin") return isBitcoinMainnetAddress(address);
  if (family === "solana") return isSolanaAddress(address);
  return isAddress(address);
}

function normalizeAssetKey(address: string, chainId: number): string {
  const value = address.trim();
  return getAddressFamilyForChain(chainId) === "evm" ? value.toLowerCase() : value;
}

function normalizeWalletKey(address: string): string {
  const value = address.trim();
  return /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : value;
}

function withCors(res: NextResponse, origin: string | null) {
  applyCorsHeaders(res.headers, origin);
  res.headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}
