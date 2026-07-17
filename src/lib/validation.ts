import { Network, validate as validateBitcoinAddress } from "bitcoin-address-validation";

export function isAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

export function isBitcoinMainnetAddress(v: string): boolean {
  const address = v.trim();
  return address.length > 0 && validateBitcoinAddress(address, Network.mainnet);
}

export function isPositiveIntegerString(v: string): boolean {
  if (!/^\d+$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}
