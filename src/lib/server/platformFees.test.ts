import { describe, expect, it } from "vitest";
import { configuredPlatformFeeBps, createPlatformFeeConfig, ZERO_ADDRESS } from "./platformFees";

const recipient = "0x1111111111111111111111111111111111111111";
const config = {
  FEE_RECIPIENT_ADDRESS: recipient,
  AFFILIATE_ADDRESS: ZERO_ADDRESS,
  PLATFORM_FEE_BPS: "20",
  PARASWAP_PARTNER: "swapassistant"
};

describe("platform fee configuration", () => {
  it("keeps the existing fee fraction, percent and cap", () => {
    expect(createPlatformFeeConfig(config)).toMatchObject({
      enabled: true, feeBps: 20, feePercent: "0.2", feeFraction: 0.002, recipient
    });
    expect(configuredPlatformFeeBps("300")).toBe(300);
  });

  it.each(["", " ", "NaN", "Infinity", "nonsense", "-1", "301", "20.4", "1e2", "0x14"])(
    "refuses invalid explicit BPS %j instead of substituting or rounding", (value) => {
      expect(() => configuredPlatformFeeBps(value)).toThrow(/whole number/);
    }
  );

  it("retains legacy recipient fallback only when the preferred value is blank", () => {
    expect(createPlatformFeeConfig({ ...config, FEE_RECIPIENT_ADDRESS: "", AFFILIATE_ADDRESS: recipient }).recipient)
      .toBe(recipient);
    expect(() => createPlatformFeeConfig({ ...config, FEE_RECIPIENT_ADDRESS: "invalid", AFFILIATE_ADDRESS: recipient }))
      .toThrow(/valid EVM address/);
  });

  it("does not silently disable configured fees when a direct recipient is absent", () => {
    expect(createPlatformFeeConfig({ ...config, FEE_RECIPIENT_ADDRESS: ZERO_ADDRESS }).enabled).toBe(true);
    // LI.FI can use portal payout wallets; 0x separately rejects a missing recipient.
    expect(createPlatformFeeConfig({ ...config, PLATFORM_FEE_BPS: "0" }).enabled).toBe(false);
  });
});
