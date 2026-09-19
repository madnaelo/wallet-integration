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

type FeeEnvironment = Pick<typeof env,
  "FEE_RECIPIENT_ADDRESS" | "AFFILIATE_ADDRESS" | "PLATFORM_FEE_BPS" | "PARASWAP_PARTNER"
>;

export function createPlatformFeeConfig(config: FeeEnvironment = env): PlatformFeeConfig {
  const rawRecipient = config.FEE_RECIPIENT_ADDRESS.trim() || config.AFFILIATE_ADDRESS.trim();
  const recipient = normalizeRecipient(rawRecipient);
  const feeBps = configuredPlatformFeeBps(config.PLATFORM_FEE_BPS);

  return {
    enabled: feeBps > 0,
    recipient,
    feeBps,
    feePercent: formatFeePercent(feeBps),
    feeFraction: feeBps / 10_000,
    paraswapPartner: config.PARASWAP_PARTNER.trim() || "swapassistant"
  };
}

function normalizeRecipient(value: string): string {
  if (!value || value === ZERO_ADDRESS) return ZERO_ADDRESS;
  if (!isAddress(value)) throw new Error("FEE_RECIPIENT_ADDRESS must be a valid EVM address.");
  return getAddress(value);
}

export function configuredPlatformFeeBps(value: string = env.PLATFORM_FEE_BPS): number {
  const normalized = value.trim();
  const feeBps = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 300) {
    throw new Error("PLATFORM_FEE_BPS must be a whole number between 0 and 300.");
  }
  return feeBps;
}

function formatFeePercent(feeBps: number): string {
  return String(feeBps / 100).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
