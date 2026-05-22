import type { TokenInfo } from "@/lib/tokens";

export async function listTokens(chainId: number, signal?: AbortSignal): Promise<TokenInfo[]> {
  const query = new URLSearchParams({ chainId: String(chainId) });
  const res = await fetch(`/api/tokens?${query.toString()}`, { method: "GET", cache: "no-store", signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Tokens are unavailable right now.");
  return Array.isArray(body?.tokens) ? (body.tokens as TokenInfo[]) : [];
}
