import { describe, expect, it } from "vitest";

import {
  getProviderErrorStatus,
  normalizeProviderError,
  providerError
} from "@/lib/server/quoteNormalization";

describe("quote provider errors", () => {
  it("does not expose upstream messages or credentials", () => {
    const result = providerError("provider", "Provider", {
      status: 401,
      message: "invalid api key super-secret-value"
    });

    expect(result.message).toBe("This route is temporarily unavailable.");
    expect(result.message).not.toContain("super-secret-value");
    expect(result.status).toBe(401);
  });

  it("uses helpful stable messages for expected provider responses", () => {
    expect(normalizeProviderError({ status: 429, message: "raw response" }))
      .toBe("This route is busy. Try again shortly.");
    expect(normalizeProviderError({ status: 422, detail: "raw response" }))
      .toBe("No route is available for these swap details.");
  });

  it("accepts only valid HTTP error statuses", () => {
    expect(getProviderErrorStatus({ status: 503 })).toBe(503);
    expect(getProviderErrorStatus({ status: 200 })).toBeUndefined();
    expect(getProviderErrorStatus(new Error("failed"))).toBeUndefined();
  });
});
