import { describe, expect, it } from "vitest";

import { MAX_QUOTE_SLIPPAGE_BPS, parseQuoteSlippageBps } from "./quoteRequestValidation";

describe("parseQuoteSlippageBps", () => {
  it("uses provider defaults when no value is supplied", () => {
    expect(parseQuoteSlippageBps("")).toEqual({ valid: true, value: undefined });
  });

  it.each(["0", "1", String(MAX_QUOTE_SLIPPAGE_BPS)])("accepts safe values: %s", (value) => {
    expect(parseQuoteSlippageBps(value)).toEqual({ valid: true, value: Number(value) });
  });

  it.each(["-1", "1.5", "1001", "100000000000000000000", "ten"])(
    "rejects unsafe values: %s",
    (value) => {
      expect(parseQuoteSlippageBps(value).valid).toBe(false);
    }
  );
});
