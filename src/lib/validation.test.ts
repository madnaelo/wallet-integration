import { describe, expect, it } from "vitest";

import { isBitcoinMainnetAddress } from "@/lib/validation";

describe("Bitcoin address validation", () => {
  it("accepts valid mainnet SegWit and legacy addresses", () => {
    expect(isBitcoinMainnetAddress("bc1q42c49r52an3y5zlnzwnujwrctrh2ds9emlhyhy")).toBe(true);
    expect(isBitcoinMainnetAddress("17VZNX1SN5NtKa8UQFxwQbFeFc3iqRYhem")).toBe(true);
  });

  it("rejects checksum errors and testnet addresses", () => {
    expect(isBitcoinMainnetAddress("bc1q42c49r52an3y5zlnzwnujwrctrh2ds9emlhyhx")).toBe(false);
    expect(isBitcoinMainnetAddress("2N4RsPe5F2fKssy2HBf2fH2d7sHdaUjKk1c")).toBe(false);
    expect(isBitcoinMainnetAddress("not-an-address")).toBe(false);
  });
});
