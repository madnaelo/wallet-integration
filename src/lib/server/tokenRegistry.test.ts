import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("token registry refresh", () => {
  it("coalesces concurrent remote refreshes for the same chain", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(tokenListResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const [first, second] = await Promise.all([getTokensForChain(1), getTokensForChain(1)]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first).toBe(second);
    expect(first.some((token) => token.symbol === "TEST")).toBe(true);
  });

  it("shares the large Uniswap catalog fetch across different chains", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      return Promise.resolve(url.startsWith("https://tokens.uniswap.org")
        ? new Response(JSON.stringify({ tokens: [] }))
        : new Response(JSON.stringify({ tokens: {} })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    await Promise.all([getTokensForChain(1), getTokensForChain(8453)]);

    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith("https://tokens.uniswap.org")))
      .toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/v1/tokens")))
      .toHaveLength(2);
  });

  it("keeps a configured network usable when remote token catalogs are empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ tokens: {} }))));
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(59144);

    expect(tokens).toContainEqual(expect.objectContaining({ symbol: "ETH", address: "ETH", isNative: true }));
  });

  it("falls back to curated tokens without reading an oversized list", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", {
      headers: { "Content-Length": String(9 * 1024 * 1024) }
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokens.some((token) => token.symbol === "ETH")).toBe(true);
  });

  it("rejects unsafe token labels and omits unsafe optional names", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      tokens: [
        token("0x1111111111111111111111111111111111111111", "SAFE", "Safe\u202eName"),
        token("0x2222222222222222222222222222222222222222", "BAD\u202e", "Unsafe symbol"),
        token("0x3333333333333333333333333333333333333333", "A".repeat(33), "Long symbol")
      ]
    })))));
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);
    const safe = tokens.find((entry) => entry.symbol === "SAFE");

    expect(safe).toMatchObject({ address: "0x1111111111111111111111111111111111111111" });
    expect(safe?.name).toBeUndefined();
    expect(tokens.some((entry) => entry.address === "0x2222222222222222222222222222222222222222")).toBe(false);
    expect(tokens.some((entry) => entry.address === "0x3333333333333333333333333333333333333333")).toBe(false);
  });

  it("prevents remote tokens from impersonating curated identities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      tokens: [
        token("0x1111111111111111111111111111111111111111", "USDT", "Fake dollar"),
        token("0x2222222222222222222222222222222222222222", "FAKE", "Tether USD"),
        token("0x3333333333333333333333333333333333333333", "TEST", "Test Token")
      ]
    })))));
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);

    expect(tokens.some((entry) => entry.address === "0x1111111111111111111111111111111111111111")).toBe(false);
    expect(tokens.some((entry) => entry.address === "0x2222222222222222222222222222222222222222")).toBe(false);
    expect(tokens.some((entry) => entry.address === "0x3333333333333333333333333333333333333333")).toBe(true);
    expect(tokens.find((entry) => entry.symbol === "USDT")?.address.toLowerCase())
      .toBe("0xdac17f958d2ee523a2206206994597c13d831ec7");
  });

  it("reads the confirmed LI.FI token catalog shape and authenticates when configured", async () => {
    vi.stubEnv("LIFI_API_KEY", "test-lifi-key");
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith("https://tokens.uniswap.org")) {
        return Promise.resolve(new Response(JSON.stringify({ tokens: [] })));
      }
      return Promise.resolve(new Response(JSON.stringify({
        tokens: {
          "1": [token("0x4444444444444444444444444444444444444444", "LIFI", "LI.FI Token")]
        }
      })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTokensForChain } = await import("@/lib/server/tokenRegistry");

    const tokens = await getTokensForChain(1);

    expect(tokens.some((entry) => entry.symbol === "LIFI")).toBe(true);
    const lifiRequest = fetchMock.mock.calls.find(([input]) => String(input).includes("/v1/tokens"));
    expect(lifiRequest?.[1]).toMatchObject({ headers: { "x-lifi-api-key": "test-lifi-key" } });
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
