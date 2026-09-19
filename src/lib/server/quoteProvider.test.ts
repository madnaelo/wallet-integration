import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./env";
import { createQuoteClient } from "./quoteProvider";

vi.mock("./env", () => ({ env: {
  SWAP_PROVIDERS: "0x,lifi",
  MONETIZED_SWAP_PROVIDERS: "0x,lifi",
  PLATFORM_FEE_BPS: "20",
  FEE_RECIPIENT_ADDRESS: "0x1111111111111111111111111111111111111111",
  AFFILIATE_ADDRESS: "",
  PARASWAP_PARTNER: "swapassistant"
} }));

afterEach(() => {
  env.PLATFORM_FEE_BPS = "20";
});

describe("monetized provider factory", () => {
  it.each(["0", "invalid", "20.1"])("refuses fee setting %s", (fee) => {
    env.PLATFORM_FEE_BPS = fee;
    expect(() => createQuoteClient(1)).toThrow(/PLATFORM_FEE_BPS/);
  });
});
