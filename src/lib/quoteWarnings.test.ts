import { describe, expect, it } from "vitest";
import { buildQuoteWarnings } from "./quoteWarnings";
import type { QuoteResponse } from "./types";

const quote: QuoteResponse = {
  sellAmount: "1000000", buyAmount: "5000000", to: "0x" + "1".repeat(40), data: "0xabcd",
  platformFeeBps: 100,
  serviceFees: [{ label: "Platform fee", kind: "platform", amount: "10000", token: "0x" + "2".repeat(40) }]
};
const input = { quote, slippageBps: 50, buyTokenFeesDeducted: "0", grossBuyAmount: "5000000" };

describe("quote warnings", () => {
  it.each([100, 150])("warns at %i BPS even when the entire platform fee is charged in the sell token", (bps) => {
    expect(buildQuoteWarnings({ ...input, quote: { ...quote, platformFeeBps: bps } }))
      .toEqual([`Platform fee is ${bps / 100}%. Review the fee breakdown before swapping.`]);
  });
  it("does not warn below the existing threshold", () => {
    expect(buildQuoteWarnings({ ...input, quote: { ...quote, platformFeeBps: 99 } })).toEqual([]);
  });
  it("retains the destination-token service fee warning", () => {
    expect(buildQuoteWarnings({ ...input, quote: { ...quote, platformFeeBps: 20 }, buyTokenFeesDeducted: "50000" }))
      .toEqual(["Service fee is about 1% of the quoted output."]);
  });
  it("does not add rates with different bases or count the same fee twice", () => {
    const mixed = { ...input, buyTokenFeesDeducted: "50000" };
    const before = structuredClone(mixed);
    expect(buildQuoteWarnings(mixed)).toEqual(["Platform fee is 1%. Review the fee breakdown before swapping."]);
    expect(mixed).toEqual(before);
  });
  it("retains slippage and unavailable-route warnings", () => {
    expect(buildQuoteWarnings({ ...input, slippageBps: 300,
      quote: { ...quote, quoteErrors: [{ providerId: "lifi", providerName: "LI.FI", message: "Unavailable" }] }
    })).toEqual([
      "Slippage is set to 3%. The final amount can move before your wallet rejects the swap.",
      "Platform fee is 1%. Review the fee breakdown before swapping.",
      "Some routes were unavailable: LI.FI. The selected quote is still from a responding route."
    ]);
  });
});
