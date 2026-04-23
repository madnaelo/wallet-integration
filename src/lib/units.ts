import { ethers } from "ethers";

export function parseUnitsSafe(amountHuman: string, decimals: number): string | null {
  try {
    const trimmed = amountHuman.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(".")) return null;
    const v = ethers.parseUnits(trimmed, decimals);
    if (v <= 0n) return null;
    return v.toString();
  } catch {
    return null;
  }
}

export function formatUnitsSafe(amountBaseUnits: string, decimals: number): string {
  try {
    return ethers.formatUnits(BigInt(amountBaseUnits), decimals);
  } catch {
    return amountBaseUnits;
  }
}
