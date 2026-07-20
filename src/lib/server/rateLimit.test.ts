import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("distributed rate limiting", () => {
  it("checks multiple dimensions in one atomic Redis command", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubEnv("RATE_LIMIT_REDIS_FAIL_OPEN", "false");
    vi.stubEnv("RATE_LIMIT_REDIS_PREFIX", "swap-assistant-prod");
    vi.stubEnv("RATE_LIMIT_KEY_PEPPER", "test-pepper-that-is-long-enough");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [1, 0] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rateLimitMany } = await import("@/lib/server/rateLimit");
    const decision = await rateLimitMany([
      "quote-ip:198.51.100.10",
      "quote-wallet:0x1111111111111111111111111111111111111111"
    ]);

    expect(decision).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://redis.example");
    const command = JSON.parse(String(request.body)) as unknown[];
    expect(command[0]).toBe("EVAL");
    expect(command[2]).toBe(2);
    expect(command[3]).toMatch(/^swap-assistant-prod:rl:[a-f0-9]{64}$/);
    expect(command[4]).toMatch(/^swap-assistant-prod:rl:[a-f0-9]{64}$/);
    expect(String(request.body)).not.toContain("198.51.100.10");
    expect(String(request.body)).not.toContain("0x1111111111111111111111111111111111111111");
  });

  it("supports an independent shared provider budget", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubEnv("RATE_LIMIT_KEY_PEPPER", "test-pepper-that-is-long-enough");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [1, 0] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rateLimitMany } = await import("@/lib/server/rateLimit");
    await rateLimitMany(["provider-budget:lifi"], { maxRequests: 100, windowMs: 60_000 });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const command = JSON.parse(String(request.body)) as unknown[];
    expect(command.at(-2)).toBe(100);
    expect(command.at(-1)).toBe(60_000);
  });

  it("accepts credentials injected by the Vercel Upstash integration", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://vercel-redis.example");
    vi.stubEnv("KV_REST_API_TOKEN", "vercel-redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubEnv("RATE_LIMIT_KEY_PEPPER", "test-pepper-that-is-long-enough");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [1, 0] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rateLimitMany } = await import("@/lib/server/rateLimit");
    await expect(rateLimitMany(["quote-ip:198.51.100.10"])).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0
    });

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://vercel-redis.example");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer vercel-redis-token"
    });
  });

  it("does not mix partial canonical credentials with Vercel credentials", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://canonical-redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://vercel-redis.example");
    vi.stubEnv("KV_REST_API_TOKEN", "vercel-redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubEnv("RATE_LIMIT_REDIS_FAIL_OPEN", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { rateLimitMany } = await import("@/lib/server/rateLimit");
    await expect(rateLimitMany(["quote-ip:198.51.100.10"])).resolves.toEqual({
      allowed: false,
      retryAfterMs: 60_000,
      unavailable: true
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when Redis returns an invalid decision", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubEnv("RATE_LIMIT_REDIS_FAIL_OPEN", "false");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const { rateLimitMany } = await import("@/lib/server/rateLimit");

    await expect(rateLimitMany(["quote-ip:198.51.100.10"])).resolves.toEqual({
      allowed: false,
      retryAfterMs: 60_000,
      unavailable: true
    });
  });

  it("returns the provider retry window when a dimension is limited", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
    vi.stubEnv("RATE_LIMIT_REDIS_REQUIRED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ result: [0, 1_250] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    const { rateLimitMany } = await import("@/lib/server/rateLimit");

    await expect(rateLimitMany(["quote-ip:198.51.100.10"])).resolves.toEqual({
      allowed: false,
      retryAfterMs: 1_250
    });
  });
});
