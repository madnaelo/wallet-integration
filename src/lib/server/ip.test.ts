import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientIp } from "@/lib/server/ip";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("client IP resolution", () => {
  it("prefers Vercel's protected forwarded header on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    const request = makeRequest({
      "x-vercel-forwarded-for": "198.51.100.10",
      "x-forwarded-for": "203.0.113.20"
    });

    expect(getClientIp(request)).toBe("198.51.100.10");
  });

  it("ignores the Vercel-specific header outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    const request = makeRequest({
      "x-vercel-forwarded-for": "198.51.100.10",
      "x-forwarded-for": "203.0.113.20"
    });

    expect(getClientIp(request)).toBe("203.0.113.20");
  });

  it("rejects malformed forwarded values", () => {
    const request = makeRequest({
      "x-forwarded-for": "not-an-ip",
      "x-real-ip": "also-invalid"
    });

    expect(getClientIp(request)).toBeNull();
  });
});

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest("https://swap.example/api/quote", { headers });
}
