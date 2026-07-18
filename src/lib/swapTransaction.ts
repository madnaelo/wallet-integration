import type { QuoteResponse } from "@/lib/types";
import { isAddress } from "@/lib/validation";

const MAX_CALLDATA_HEX_LENGTH = 256 * 1024;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type ValidateSwapTransactionParams = {
  quote: QuoteResponse;
  expectedSellAmountRaw: string;
  sellTokenIsNative: boolean;
  expectedWalletAddress: string;
  signerAddress: string;
};

export type ValidatedSwapTransaction = {
  to: string;
  data: string;
  value: bigint;
};

export function validateSwapTransaction(
  params: ValidateSwapTransactionParams
): ValidatedSwapTransaction {
  if (
    !isAddress(params.expectedWalletAddress)
    || !isAddress(params.signerAddress)
    || params.expectedWalletAddress.toLowerCase() !== params.signerAddress.toLowerCase()
  ) {
    throw new Error("The wallet account changed. Reconnect it and review the swap again.");
  }

  const expectedSellAmount = requireUint(params.expectedSellAmountRaw, "sell amount", true);
  const quotedSellAmount = requireUint(params.quote.sellAmount, "quoted sell amount", true);
  if (quotedSellAmount !== expectedSellAmount) {
    throw new Error("The swap amount changed after this quote was created. Refresh the quote.");
  }

  if (!isAddress(params.quote.to) || params.quote.to.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("This route did not return a valid swap contract. Refresh and try another route.");
  }
  if (
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(params.quote.data)
    || params.quote.data.length > MAX_CALLDATA_HEX_LENGTH
    || (!params.sellTokenIsNative && params.quote.data === "0x")
  ) {
    throw new Error("This route did not return valid swap instructions. Refresh and try another route.");
  }

  const value = requireUint(params.quote.value ?? "0", "transaction value");
  const expectedValue = params.sellTokenIsNative ? expectedSellAmount : 0n;
  if (value !== expectedValue) {
    throw new Error("This route requested an unexpected wallet payment. Refresh and try another route.");
  }

  return {
    to: params.quote.to,
    data: params.quote.data,
    value
  };
}

function requireUint(value: string, label: string, positive = false): bigint {
  if (!/^\d{1,78}$/.test(value)) throw new Error(`The ${label} is invalid.`);
  const parsed = BigInt(value);
  if (parsed > UINT256_MAX || (positive && parsed === 0n)) {
    throw new Error(`The ${label} is invalid.`);
  }
  return parsed;
}
