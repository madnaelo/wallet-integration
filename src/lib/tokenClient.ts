import type { TokenInfo } from "@/lib/tokens";

const TOKEN_CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedTokenList = {
  tokens: TokenInfo[];
  expiresAt: number;
};

const tokenCache = new Map<number, CachedTokenList>();
const tokenRequests = new Map<number, Promise<TokenInfo[]>>();

export async function listTokens(chainId: number, signal?: AbortSignal): Promise<TokenInfo[]> {
  const cached = tokenCache.get(chainId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tokens;
  }

  let request = tokenRequests.get(chainId);
  if (!request) {
    request = fetchTokens(chainId).finally(() => tokenRequests.delete(chainId));
    tokenRequests.set(chainId, request);
  }

  return withAbort(request, signal);
}

async function fetchTokens(chainId: number): Promise<TokenInfo[]> {
  const query = new URLSearchParams({ chainId: String(chainId) });
  const res = await fetch(`/api/tokens?${query.toString()}`, { method: "GET", cache: "default" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Tokens are unavailable right now.");
  const tokens = Array.isArray(body?.tokens) ? (body.tokens as TokenInfo[]) : [];
  tokenCache.set(chainId, { tokens, expiresAt: Date.now() + TOKEN_CLIENT_CACHE_TTL_MS });
  return tokens;
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
