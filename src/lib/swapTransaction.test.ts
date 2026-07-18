import { describe, expect, it } from "vitest";

import { validateSwapTransaction } from "@/lib/swapTransaction";
import type { QuoteResponse } from "@/lib/types";

const WALLET = "0x1111111111111111111111111111111111111111";
const ROUTER = "0x2222222222222222222222222222222222222222";

function quote(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  return {
    sellAmount: "100",
    buyAmount: "200",
    to: ROUTER,
    data: "0x1234",
    value: "0",
    ...overrides
  };
}

describe("validateSwapTransaction", () => {
  it("accepts a token swap bound to the active account and quoted amount", () => {
    expect(validateSwapTransaction({
      quote: quote(),
      expectedSellAmountRaw: "100",
      sellTokenIsNative: false,
      expectedWalletAddress: WALLET,
      signerAddress: WALLET.toUpperCase().replace("0X", "0x")
    })).toEqual({
      to: ROUTER,
      data: "0x1234",
      value: 0n
    });
  });

  it("accepts only the exact sell amount as native transaction value", () => {
    expect(validateSwapTransaction({
      quote: quote({ value: "100" }),
      expectedSellAmountRaw: "100",
      sellTokenIsNative: true,
      expectedWalletAddress: WALLET,
      signerAddress: WALLET
    }).value).toBe(100n);

    expect(() => validateSwapTransaction({
      quote: quote({ value: "101" }),
      expectedSellAmountRaw: "100",
      sellTokenIsNative: true,
      expectedWalletAddress: WALLET,
      signerAddress: WALLET
    })).toThrow(/unexpected wallet payment/i);
  });

  it.each([
    { quote: quote({ to: "0x0000000000000000000000000000000000000000" }), message: /valid swap contract/i },
    { quote: quote({ data: "0x123" }), message: /valid swap instructions/i },
    { quote: quote({ sellAmount: "99" }), message: /amount changed/i },
    { quote: quote({ value: "1" }), message: /unexpected wallet payment/i }
  ])("rejects unsafe token transaction fields", ({ quote: unsafeQuote, message }) => {
    expect(() => validateSwapTransaction({
      quote: unsafeQuote,
      expectedSellAmountRaw: "100",
      sellTokenIsNative: false,
      expectedWalletAddress: WALLET,
      signerAddress: WALLET
    })).toThrow(message);
  });

  it("rejects a signer different from the connected account", () => {
    expect(() => validateSwapTransaction({
      quote: quote(),
      expectedSellAmountRaw: "100",
      sellTokenIsNative: false,
      expectedWalletAddress: WALLET,
      signerAddress: "0x3333333333333333333333333333333333333333"
    })).toThrow(/account changed/i);
  });
});
