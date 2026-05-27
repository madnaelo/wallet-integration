export function isAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

export function isPositiveIntegerString(v: string): boolean {
  if (!/^\d+$/.test(v)) return false;
  try {
    return BigInt(v) > 0n;
  } catch {
    return false;
  }
}
