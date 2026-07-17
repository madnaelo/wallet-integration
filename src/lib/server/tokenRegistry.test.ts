import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("token registry refresh", () => {
  it("coalesces concurrent remote refreshes for the same chain", async () => {
    vi.stubEnv("ONEINCH_API_KEY", "");
    const fetchMock = vi.fn().mockResolvedValue(tokenListResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const [first, second] = await Promise.all([getTokensForChain(1), getTokensForChain(1)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.some((token) => token.symbol === "TEST")).toBe(true);
  });

  it("falls back to curated tokens without reading an oversized list", async () => {
    vi.stubEnv("ONEINCH_API_KEY", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", {
      headers: { "Content-Length": String(9 * 1024 * 1024) }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tokens.some((token) => token.symbol === "ETH")).toBe(true);
  });
});

function tokenListResponse(): Response {
  return new Response(JSON.stringify({
    tokens: [
      {
        chainId: 1,
        address: "0x1111111111111111111111111111111111111111",
        symbol: "TEST",
        name: "Test Token",
        decimals: 18
      }
    ]
  }), { headers: { "Content-Type": "application/json" } });
}
