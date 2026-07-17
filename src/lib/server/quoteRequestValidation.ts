export const MAX_QUOTE_SLIPPAGE_BPS = 1_000;

type SlippageValidation =
  | { valid: true; value: number | undefined }
  | { valid: false; error: string };

export function parseQuoteSlippageBps(value: string): SlippageValidation {
  if (!value) return { valid: true, value: undefined };
  if (!/^\d+$/.test(value)) {
    return { valid: false, error: "Enter a valid slippage tolerance." };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_QUOTE_SLIPPAGE_BPS) {
    return { valid: false, error: "Slippage tolerance must be between 0% and 10%." };
  }
  return { valid: true, value: parsed };
}
