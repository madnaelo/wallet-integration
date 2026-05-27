export function parseUnitsSafe(amountHuman: string, decimals: number): string | null {
  try {
    const trimmed = amountHuman.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith(".")) return null;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

    const [whole, fractional = ""] = trimmed.split(".");
    if (fractional.length > decimals) return null;

    const wholeUnits = BigInt(whole || "0") * 10n ** BigInt(decimals);
    const fractionalUnits = fractional
      ? BigInt(fractional.padEnd(decimals, "0"))
      : 0n;
    const value = wholeUnits + fractionalUnits;
    if (value <= 0n) return null;
    return value.toString();
  } catch {
    return null;
  }
}

export function formatUnitsSafe(amountBaseUnits: string, decimals: number): string {
  try {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return amountBaseUnits;
    const raw = BigInt(amountBaseUnits);
    const sign = raw < 0n ? "-" : "";
    const value = raw < 0n ? -raw : raw;
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const fractional = value % scale;
    if (decimals === 0 || fractional === 0n) return `${sign}${whole.toString()}`;
    const fractionalText = fractional.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${sign}${whole.toString()}.${fractionalText}`;
  } catch {
    return amountBaseUnits;
  }
}
