import { Network, validate as validateBitcoinAddress } from "bitcoin-address-validation";
import { PublicKey } from "@solana/web3.js";

export function isAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

export function isBitcoinMainnetAddress(v: string): boolean {
  const address = v.trim();
  return address.length > 0 && validateBitcoinAddress(address, Network.mainnet);
}

export function isSolanaAddress(v: string): boolean {
  const address = v.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  try {
    return new PublicKey(address).toBase58() === address;
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
