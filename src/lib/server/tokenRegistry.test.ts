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

  it("rejects unsafe token labels and omits unsafe optional names", async () => {
    vi.stubEnv("ONEINCH_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tokens: [
        token("0x1111111111111111111111111111111111111111", "SAFE", "Safe\u202eName"),
        token("0x2222222222222222222222222222222222222222", "BAD\u202e", "Unsafe symbol"),
        token("0x3333333333333333333333333333333333333333", "A".repeat(33), "Long symbol")
      ]
    }))));
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);
    const safe = tokens.find((entry) => entry.symbol === "SAFE");

    expect(safe).toMatchObject({ address: "0x1111111111111111111111111111111111111111" });
    expect(safe?.name).toBeUndefined();
    expect(tokens.some((entry) => entry.address === "0x2222222222222222222222222222222222222222")).toBe(false);
    expect(tokens.some((entry) => entry.address === "0x3333333333333333333333333333333333333333")).toBe(false);
  });
});

function token(address: string, symbol: string, name: string) {
  return { chainId: 1, address, symbol, name, decimals: 18 };
}

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
