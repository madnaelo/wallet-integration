import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

async function decision(headers: Record<string, string>, requireOrigin = true) {
  vi.resetModules();
  vi.stubEnv("CORS_ALLOW_ORIGINS", "https://app.example.com");
  vi.stubEnv("REQUIRE_ALLOWED_ORIGIN", String(requireOrigin));
  const { evaluateRequestOrigin } = await import("@/lib/server/requestOrigin");
  return evaluateRequestOrigin(new NextRequest("https://app.example.com/api/quote", { headers }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("evaluateRequestOrigin", () => {
  it("accepts an explicitly allowed origin", async () => {
    await expect(decision({ origin: "https://app.example.com" })).resolves.toMatchObject({ allowed: true });
  });

  it("rejects a cross-site browser request even without an Origin header", async () => {
    await expect(decision({ "sec-fetch-site": "cross-site" })).resolves.toMatchObject({ allowed: false });
  });

  it("accepts a same-origin browser fetch without an Origin header", async () => {
    await expect(decision({ "sec-fetch-site": "same-origin" })).resolves.toMatchObject({ allowed: true });
  });

  it("accepts a trusted referrer when Fetch Metadata is unavailable", async () => {
    await expect(decision({ referer: "https://app.example.com/swap" })).resolves.toMatchObject({ allowed: true });
  });

  it("rejects requests without browser provenance when production requires it", async () => {
    await expect(decision({})).resolves.toMatchObject({ allowed: false });
  });

  it("keeps direct local-development requests available when the requirement is disabled", async () => {
    await expect(decision({}, false)).resolves.toMatchObject({ allowed: true });
  });
});
