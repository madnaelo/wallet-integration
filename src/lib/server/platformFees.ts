import { getAddress, isAddress } from "ethers";
import { env } from "@/lib/server/env";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type PlatformFeeConfig = {
  enabled: boolean;
  recipient: string;
  feeBps: number;
  feePercent: string;
  feeFraction: number;
  paraswapPartner: string;
};

export function createPlatformFeeConfig(): PlatformFeeConfig {
  const rawRecipient = env.FEE_RECIPIENT_ADDRESS.trim() || env.AFFILIATE_ADDRESS.trim();
  const recipient = normalizeRecipient(rawRecipient);
  const feeBps = normalizeFeeBps(env.PLATFORM_FEE_BPS);

  return {
    enabled: feeBps > 0 && recipient !== ZERO_ADDRESS,
    recipient,
    feeBps,
    feePercent: formatFeePercent(feeBps),
    feeFraction: feeBps / 10_000,
    paraswapPartner: env.PARASWAP_PARTNER.trim() || "thewallet"
  };
}

function normalizeRecipient(value: string): string {
  if (!value || value === ZERO_ADDRESS) return ZERO_ADDRESS;
  if (!isAddress(value)) throw new Error("FEE_RECIPIENT_ADDRESS must be a valid EVM address.");
  return getAddress(value);
}

function normalizeFeeBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 300) {
    throw new Error("PLATFORM_FEE_BPS must be between 0 and 300.");
  }
  return rounded;
}

function formatFeePercent(feeBps: number): string {
  return String(feeBps / 100).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
