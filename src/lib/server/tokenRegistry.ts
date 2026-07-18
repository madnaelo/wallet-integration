import "server-only";

import { env } from "@/lib/server/env";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { isAddress } from "@/lib/validation";

const UNISWAP_TOKEN_LIST_URL = "https://tokens.uniswap.org";
const ONEINCH_BASE_URL = "https://api.1inch.dev";
const TOKEN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 8_000;
const MAX_TOKEN_LIST_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_TOKENS_PER_SOURCE = 10_000;
const MAX_MERGED_TOKENS = 10_000;
const MAX_TOKEN_SYMBOL_LENGTH = 32;
const MAX_TOKEN_NAME_LENGTH = 128;
const UNSAFE_DISPLAY_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069]/u;
const NATIVE_TOKEN_SENTINELS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
]);

type CachedTokens = {
  expiresAt: number;
  tokens: TokenInfo[];
};

const tokenCache = new Map<number, CachedTokens>();
const tokenLoads = new Map<number, Promise<TokenInfo[]>>();

export async function getTokensForChain(chainId: number): Promise<TokenInfo[]> {
  const cached = tokenCache.get(chainId);
  if (cached && cached.expiresAt > Date.now()) return cached.tokens;

  const pending = tokenLoads.get(chainId);
  if (pending) return pending;

  const load = refreshTokensForChain(chainId);
  tokenLoads.set(chainId, load);
  try {
    return await load;
  } finally {
    if (tokenLoads.get(chainId) === load) tokenLoads.delete(chainId);
  }
}

async function refreshTokensForChain(chainId: number): Promise<TokenInfo[]> {
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
  const curatedSymbols = new Set(curated.map((token) => normalizeIdentity(token.symbol)));
  const curatedNames = new Set(
    curated.flatMap((token) => token.name ? [normalizeIdentity(token.name)] : [])
  );

  for (const token of curated) {
    if (tokens.size >= MAX_MERGED_TOKENS) break;
    const key = normalizeTokenKey(token.address);
    if (!tokens.has(key)) tokens.set(key, token);
  }

  for (const token of remote) {
    if (tokens.size >= MAX_MERGED_TOKENS) break;
    const key = normalizeTokenKey(token.address);
    if (tokens.has(key)) continue;
    if (curatedSymbols.has(normalizeIdentity(token.symbol))) continue;
    if (token.name && curatedNames.has(normalizeIdentity(token.name))) continue;
    tokens.set(key, token);
  }

  return [...tokens.values()];
}

async function loadUniswapTokens(chainId: number): Promise<TokenInfo[]> {
  const body = await fetchJson(UNISWAP_TOKEN_LIST_URL);
  if (!isRecord(body) || !Array.isArray(body.tokens)) return [];
  return body.tokens
    .slice(0, MAX_REMOTE_TOKENS_PER_SOURCE)
    .flatMap((token) => toTokenInfo(token, chainId));
}

async function loadOneInchTokens(chainId: number): Promise<TokenInfo[]> {
  if (!hasApiKey(env.ONEINCH_API_KEY, "your_1inch_api_key_here")) return [];

  const url = new URL(`/swap/v6.1/${chainId}/tokens`, ONEINCH_BASE_URL);
  const body = await fetchJson(url.toString(), {
    Authorization: `Bearer ${env.ONEINCH_API_KEY}`
  });
  if (!isRecord(body) || !isRecord(body.tokens)) return [];
  const tokens = body.tokens;

  return Object.entries(tokens)
    .slice(0, MAX_REMOTE_TOKENS_PER_SOURCE)
    .flatMap(([address, token]) => {
      if (!isRecord(token)) return [];
      const declaredAddress = typeof token.address === "string" ? token.address.trim() : "";
      if (declaredAddress && normalizeTokenKey(declaredAddress) !== normalizeTokenKey(address)) return [];
      return toTokenInfo({ ...token, address }, chainId);
    });
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
  const text = await readBoundedResponseText(res);
  if (!res.ok) throw new Error(`Token list request failed with status ${res.status}.`);
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    throw new Error("Token list response was not valid JSON.");
  }
}

async function readBoundedResponseText(res: Response): Promise<string> {
  const declaredLength = Number(res.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TOKEN_LIST_RESPONSE_BYTES) {
    throw new Error("Token list response exceeded the safe size limit.");
  }

  const reader = res.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_TOKEN_LIST_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Token list response exceeded the safe size limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function toTokenInfo(value: unknown, chainId: number): TokenInfo[] {
  if (!isRecord(value)) return [];
  if (typeof value.chainId === "number" && value.chainId !== chainId) return [];

  const address = typeof value.address === "string" ? value.address.trim() : "";
  const symbol = normalizeDisplayText(value.symbol, MAX_TOKEN_SYMBOL_LENGTH);
  const decimals = typeof value.decimals === "number" ? value.decimals : Number.NaN;
  if (!address || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return [];
  if (!isAddress(address) || NATIVE_TOKEN_SENTINELS.has(normalizeTokenKey(address))) return [];

  const token: TokenInfo = { address, symbol, decimals };
  const name = normalizeDisplayText(value.name, MAX_TOKEN_NAME_LENGTH);
  if (name) token.name = name;
  return [token];
}

function normalizeDisplayText(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > maximumLength || UNSAFE_DISPLAY_CHARACTERS.test(normalized)) return "";
  return normalized;
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

function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}
