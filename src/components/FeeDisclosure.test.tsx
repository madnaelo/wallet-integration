import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approximateFee, DestinationFeeOutput, FeeEquivalent } from "./FeeDisclosure";

describe("fee disclosures", () => {
  it("does not invent no-fee destination output for LI.FI or other source-token fees", () => {
    expect(renderToStaticMarkup(<DestinationFeeOutput amount="100 USDT" hasOtherTokenFees />)).toBe("");
  });
  it("labels the reconstructable destination-only subtotal precisely", () => {
    expect(renderToStaticMarkup(<DestinationFeeOutput amount="100 USDT" hasOtherTokenFees={false} />))
      .toContain("Before destination-token fees");
  });
  it("visibly marks each converted equivalent and mixed total approximate", () => {
    expect(renderToStaticMarkup(<FeeEquivalent>2 USDT</FeeEquivalent>)).toContain("Approx. 2 USDT");
    expect(approximateFee("3 USDT", true)).toBe("Approx. 3 USDT");
    expect(approximateFee("3 USDT", false)).toBe("3 USDT");
  });
});
