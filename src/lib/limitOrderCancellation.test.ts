import { describe, expect, it } from "vitest";
import { validateOneInchCancellationTerms } from "@/lib/limitOrderCancellation";

const CONTRACT = "0x111111125421ca6dc452d289314280a0f8842a65";
const ORDER_HASH = "0x" + "a".repeat(64);

describe("validateOneInchCancellationTerms", () => {
  it("accepts the exact trusted contract and uint256 traits", () => {
    expect(validateOneInchCancellationTerms(CONTRACT, CONTRACT, "123", ORDER_HASH)).toBe(123n);
  });

  it("rejects a cancellation contract that differs from the trusted deployment", () => {
    expect(() => validateOneInchCancellationTerms(
      "0x0000000000000000000000000000000000000001",
      CONTRACT,
      "123",
      ORDER_HASH
    )).toThrow(/contract/i);
  });

  it("rejects malformed hashes and overflowing traits", () => {
    expect(() => validateOneInchCancellationTerms(CONTRACT, CONTRACT, "123", "0x1234")).toThrow(/hash/i);
    expect(() => validateOneInchCancellationTerms(
      CONTRACT,
      CONTRACT,
      (1n << 256n).toString(),
      ORDER_HASH
    )).toThrow(/settings/i);
  });
});
