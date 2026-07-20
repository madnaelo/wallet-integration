import "server-only";

import { env } from "@/lib/server/env";
import { getSwapChainById } from "@/lib/chains";
import {
  getAddressFamilyForChain,
  getWalletNamespaceForFamily,
  NATIVE_BITCOIN_TOKEN_ADDRESS,
  NATIVE_SOLANA_TOKEN_ADDRESS
} from "@/lib/ecosystems";
import { DEFAULT_TOKENS_BY_CHAIN, type TokenInfo } from "@/lib/tokens";
import { isAddress, isSolanaAddress } from "@/lib/validation";

const UNISWAP_TOKEN_LIST_URL = "https://tokens.uniswap.org";
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
let uniswapTokenListCache: { expiresAt: number; value: unknown } | undefined;
let uniswapTokenListLoad: Promise<unknown> | undefined;

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
  const curated = DEFAULT_TOKENS_BY_CHAIN[chainId] ?? nativeTokenForChain(chainId);
  const family = getAddressFamilyForChain(chainId);
  const remoteResults = await Promise.allSettled(
    family === "evm"
      ? [loadUniswapTokens(chainId), loadLifiTokens(chainId)]
      : [loadLifiTokens(chainId)]
  );

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
  const body = await loadUniswapTokenList();
  if (!isRecord(body) || !Array.isArray(body.tokens)) return [];
  return body.tokens
    .slice(0, MAX_REMOTE_TOKENS_PER_SOURCE)
    .flatMap((token) => toTokenInfo(token, chainId));
}

async function loadUniswapTokenList(): Promise<unknown> {
  if (uniswapTokenListCache && uniswapTokenListCache.expiresAt > Date.now()) {
    return uniswapTokenListCache.value;
  }
  if (uniswapTokenListLoad) return uniswapTokenListLoad;

  const load = fetchJson(UNISWAP_TOKEN_LIST_URL).then((value) => {
    uniswapTokenListCache = { expiresAt: Date.now() + TOKEN_CACHE_TTL_MS, value };
    return value;
  });
  uniswapTokenListLoad = load;
  try {
    return await load;
  } finally {
    if (uniswapTokenListLoad === load) uniswapTokenListLoad = undefined;
  }
}

async function loadLifiTokens(chainId: number): Promise<TokenInfo[]> {
  const url = new URL("/v1/tokens", env.LIFI_BASE_URL);
  url.searchParams.set("chains", String(chainId));
  const family = getAddressFamilyForChain(chainId);
  if (family === "solana") url.searchParams.set("chainTypes", "SVM");
  if (family === "bitcoin") url.searchParams.set("chainTypes", "UTXO");
  const apiKey = env.LIFI_API_KEY.trim();
  const body = await fetchJson(url.toString(), apiKey ? { "x-lifi-api-key": apiKey } : undefined);
  const tokens = readLifiTokensForChain(body, chainId);

  return tokens
    .slice(0, MAX_REMOTE_TOKENS_PER_SOURCE)
    .flatMap((token) => toTokenInfo(token, chainId));
}

function readLifiTokensForChain(value: unknown, chainId: number): unknown[] {
  if (!isRecord(value)) return [];
  if (Array.isArray(value.tokens)) return value.tokens;

  const tokenGroups = isRecord(value.tokens) ? value.tokens : value;
  const tokens = tokenGroups[String(chainId)];
  return Array.isArray(tokens) ? tokens : [];
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

  const family = getAddressFamilyForChain(chainId);
  if (family === "evm" && (!isAddress(address) || NATIVE_TOKEN_SENTINELS.has(normalizeTokenKey(address)))) return [];
  if (family === "solana" && !isSolanaAddress(address)) return [];
  if (family === "bitcoin" && normalizeTokenKey(address) !== NATIVE_BITCOIN_TOKEN_ADDRESS) return [];

  const chain = getSwapChainById(chainId);
  const token: TokenInfo = {
    address,
    symbol,
    decimals,
    ...(family === "evm" ? {} : {
      addressFamily: family,
      assetKind: family,
      walletNamespace: getWalletNamespaceForFamily(family),
      networkId: chain?.networkId,
      networkName: chain?.name
    })
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTokenKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIdentity(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function nativeTokenForChain(chainId: number): TokenInfo[] {
  const chain = getSwapChainById(chainId);
  const nativeCurrency = chain?.nativeCurrency;
  const family = getAddressFamilyForChain(chainId);
  return nativeCurrency ? [{
    address: family === "bitcoin"
      ? NATIVE_BITCOIN_TOKEN_ADDRESS
      : family === "solana"
        ? NATIVE_SOLANA_TOKEN_ADDRESS
        : "ETH",
    symbol: nativeCurrency.symbol,
    decimals: nativeCurrency.decimals,
    name: nativeCurrency.name,
    isNative: true,
    ...(family === "evm" ? {} : {
      addressFamily: family,
      assetKind: family,
      walletNamespace: getWalletNamespaceForFamily(family),
      networkId: chain?.networkId,
      networkName: chain?.name
    })
  }] : [];
}
