import { describe, expect, it } from "vitest";
import {
  COW_PROTOCOL_PROVIDER,
  ONEINCH_ORDERBOOK_PROVIDER,
  resolveTrustedLimitOrderSpender
} from "@/lib/limitOrderSpender";

describe("resolveTrustedLimitOrderSpender", () => {
  it("returns the official CoW VaultRelayer on supported networks", async () => {
    await expect(resolveTrustedLimitOrderSpender(COW_PROTOCOL_PROVIDER, 1)).resolves.toBe(
      "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110"
    );
  });

  it("uses the official 1inch SDK contract address", async () => {
    await expect(resolveTrustedLimitOrderSpender(ONEINCH_ORDERBOOK_PROVIDER, 1)).resolves.toBe(
      "0x111111125421ca6dc452d289314280a0f8842a65"
    );
  }, 15_000);

  it("rejects unknown providers and unsupported chains", async () => {
    await expect(resolveTrustedLimitOrderSpender("unknown", 1)).rejects.toThrow("not trusted");
    await expect(resolveTrustedLimitOrderSpender(COW_PROTOCOL_PROVIDER, 999999)).rejects.toThrow("not approved");
    await expect(resolveTrustedLimitOrderSpender(ONEINCH_ORDERBOOK_PROVIDER, 999999)).rejects.toThrow("not approved");
  });
});
