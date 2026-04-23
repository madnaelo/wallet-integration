import { ethers } from "ethers";

export function isAddress(v: string): boolean {
  try {
    return ethers.isAddress(v);
  } catch {
    return false;
  }
}

export function isPositiveIntegerString(v: string): boolean {
  if (!/^\d+$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}
