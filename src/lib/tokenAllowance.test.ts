import { describe, expect, it } from "vitest";
import { buildExactApprovalPlan } from "@/lib/tokenAllowance";

describe("buildExactApprovalPlan", () => {
  it("does nothing when the existing allowance is sufficient", () => {
    expect(buildExactApprovalPlan(100n, 100n)).toEqual([]);
    expect(buildExactApprovalPlan(200n, 100n)).toEqual([]);
  });

  it("approves only the exact requested amount from zero", () => {
    expect(buildExactApprovalPlan(0n, 100n)).toEqual([100n]);
  });

  it("resets a smaller existing allowance before setting the exact amount", () => {
    expect(buildExactApprovalPlan(25n, 100n)).toEqual([0n, 100n]);
  });

  it("rejects invalid amounts", () => {
    expect(() => buildExactApprovalPlan(0n, 0n)).toThrow();
    expect(() => buildExactApprovalPlan(-1n, 1n)).toThrow();
  });
});
