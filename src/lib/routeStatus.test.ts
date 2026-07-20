import { describe, expect, it } from "vitest";
import { routeStatusDelayMs, shouldTrackRoute } from "@/lib/routeStatus";

describe("route status tracking", () => {
  it("tracks only LI.FI cross-network routes", () => {
    expect(shouldTrackRoute({
      providerId: "lifi",
      fromChainId: 1,
      toChainId: 8453,
      buyAmount: "1",
      sellAmount: "1",
      to: "0x1",
      data: "0x"
    })).toBe(true);
    expect(shouldTrackRoute({
      providerId: "0x",
      fromChainId: 1,
      toChainId: 1,
      buyAmount: "1",
      sellAmount: "1",
      to: "0x1",
      data: "0x"
    })).toBe(false);
  });

  it("backs off status checks for long-running routes", () => {
    expect(routeStatusDelayMs(0)).toBe(10_000);
    expect(routeStatusDelayMs(6)).toBe(30_000);
    expect(routeStatusDelayMs(12)).toBe(60_000);
  });
});
