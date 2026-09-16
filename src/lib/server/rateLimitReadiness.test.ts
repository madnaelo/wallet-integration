import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example/");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-redis-token");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("rate-limit dependency readiness", () => {
  it("pings with the same authenticated, bounded transport without modifying keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ result: "PONG" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getRateLimitReadiness } = await import("@/lib/server/rateLimit");

    await expect(getRateLimitReadiness()).resolves.toEqual({ ready: true, mode: "redis" });
    expect(fetchMock).toHaveBeenCalledWith("https://redis.example", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer test-redis-token", "Content-Type": "application/json" },
      body: '["PING"]',
      cache: "no-store",
      signal: expect.any(AbortSignal)
    }));
  });

  it("shares an in-flight probe and refreshes its cached result after one minute", async () => {
    let now = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let resolveProbe!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => {
      resolveProbe = resolve;
    })).mockImplementation(() => Promise.resolve(Response.json({ result: "PONG" })));
    vi.stubGlobal("fetch", fetchMock);
    const { getRateLimitReadiness } = await import("@/lib/server/rateLimit");

    const first = getRateLimitReadiness();
    const concurrent = getRateLimitReadiness();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveProbe(Response.json({ result: "PONG" }));
    await expect(first).resolves.toEqual({ ready: true, mode: "redis" });
    await concurrent;
    now += 59_999;
    await getRateLimitReadiness();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 1;
    await getRateLimitReadiness();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["HTTP failure", () => Response.json({ error: "private upstream detail" }, { status: 401 })],
    ["Redis error", () => Response.json({ error: "private upstream detail" })],
    ["wrong result", () => Response.json({ result: "OK" })],
    ["empty result", () => Response.json(null)],
    ["invalid JSON", () => new Response("not JSON")]
  ])("caches %s as unhealthy without disclosing upstream details", async (_name, response) => {
    const fetchMock = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal("fetch", fetchMock);
    const { getRateLimitReadiness } = await import("@/lib/server/rateLimit");
    await expect(getRateLimitReadiness()).resolves.toEqual({ ready: false, mode: "redis" });
    await getRateLimitReadiness();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns unhealthy on a network timeout, including with fail-open configured", async () => {
    vi.stubEnv("RATE_LIMIT_REDIS_FAIL_OPEN", "true");
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")));
    const { getRateLimitReadiness } = await import("@/lib/server/rateLimit");
    await expect(getRateLimitReadiness()).resolves.toEqual({ ready: false, mode: "redis" });
    expect(timeoutSpy).toHaveBeenCalledWith(2_500);
  });

  it.each([true, false])("handles absent Redis configuration with required=%s without networking", async (required) => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", String(required));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getRateLimitReadiness } = await import("@/lib/server/rateLimit");
    await expect(getRateLimitReadiness()).resolves.toEqual({ ready: !required, mode: "memory" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, false])("serves the awaited health result with ready=%s and no response caching", async (ready) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: ready ? "PONG" : null })));
    const { GET } = await import("@/app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(ready ? 200 : 503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      status: ready ? "ok" : "degraded",
      dependencies: { rateLimit: { ready, mode: "redis" } }
    });
  });
});
