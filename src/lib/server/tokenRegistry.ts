import "server-only";

import { env } from "@/lib/server/env";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { isAddress } from "@/lib/validation";

const UNISWAP_TOKEN_LIST_URL = "https://tokens.uniswap.org";
const ONEINCH_BASE_URL = "https://api.1inch.dev";
const TOKEN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 8_000;
const NATIVE_TOKEN_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
]);

type CachedTokens = {
  expiresAt: number;
  tokens: TokenInfo[];
};

const tokenCache = new Map<number, CachedTokens>();

export async function getTokensForChain(chainId: number): Promise<TokenInfo[]> {
  const cached = tokenCache.get(chainId);
  if (cached && cached.expiresAt > Date.now()) return cached.tokens;

  const curated = DEFAULT_TOKENS_BY_CHAIN[chainId] ?? [];
  const remoteResults = await Promise.allSettled([
    loadUniswapTokens(chainId),
    loadOneInchTokens(chainId)
  ]);

  const remote = remoteResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const tokens = mergeTokens(curated, remote);
  tokenCache.set(chainId, {
    expiresAt: Date.now() + (remote.length ? TOKEN_CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS),
    tokens
  });

  return tokens;
}

function mergeTokens(curated: TokenInfo[], remote: TokenInfo[]): TokenInfo[] {
  const tokens = new Map<string, TokenInfo>();
  [...curated, ...remote].forEach((token) => {
    const key = normalizeTokenKey(token.address);
    if (!tokens.has(key)) tokens.set(key, token);
  });
  return [...tokens.values()];
}

async function loadUniswapTokens(chainId: number): Promise<TokenInfo[]> {
  const body = await fetchJson(UNISWAP_TOKEN_LIST_URL);
  if (!isRecord(body) || !Array.isArray(body.tokens)) return [];
  return body.tokens.flatMap((token) => toTokenInfo(token, chainId));
}

async function loadOneInchTokens(chainId: number): Promise<TokenInfo[]> {
  if (!hasApiKey(env.ONEINCH_API_KEY, "your_1inch_api_key_here")) return [];

  const url = new URL(`/swap/v6.1/${chainId}/tokens`, ONEINCH_BASE_URL);
  const body = await fetchJson(url.toString(), {
    Authorization: `Bearer ${env.ONEINCH_API_KEY}`
  });
  if (!isRecord(body) || !isRecord(body.tokens)) return [];

  return Object.values(body.tokens).flatMap((token) => toTokenInfo(token, chainId));
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...headers
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`Token list request failed with status ${res.status}.`);
  return res.json();
}

function toTokenInfo(value: unknown, chainId: number): TokenInfo[] {
  if (!isRecord(value)) return [];
  if (typeof value.chainId === "number" && value.chainId !== chainId) return [];

  const address = typeof value.address === "string" ? value.address.trim() : "";
  const symbol = typeof value.symbol === "string" ? value.symbol.trim() : "";
  const decimals = typeof value.decimals === "number" ? value.decimals : Number.NaN;
  if (!address || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return [];
  if (!isAddress(address) || NATIVE_TOKEN_SENTINELS.has(normalizeTokenKey(address))) return [];

  const token: TokenInfo = { address, symbol, decimals };
  if (typeof value.name === "string" && value.name.trim()) token.name = value.name.trim();
  if (typeof value.logoURI === "string" && value.logoURI.trim()) token.logoURI = value.logoURI.trim();
  return [token];
}

function hasApiKey(value: string, placeholder: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== placeholder;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTokenKey(value: string): string {
  return value.trim().toLowerCase();
}
