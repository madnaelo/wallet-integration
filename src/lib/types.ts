export type QuoteRouteLine = {
  source: string;
  share: string;
};

export type QuoteFee = {
  label: string;
  amount: string;
  token: string;
};

export type QuoteProviderError = {
  providerId: string;
  providerName: string;
  message: string;
  status?: number;
};

export type QuoteResponse = {
  quoteId?: string;
  providerId?: string;
  providerName?: string;
  executionKind?: "evm-same-chain" | "evm-to-bitcoin";
  providerRank?: number;
  isBest?: boolean;
  platformFeeBps?: number;
  price?: string;
  buyAmount: string;
  sellAmount: string;
  grossBuyAmount?: string;
  netBuyAmount?: string;
  minBuyAmount?: string;

  to: string;
  data: string;
  value?: string;
  gas?: string;

  allowanceTarget?: string;
  routeLines?: QuoteRouteLine[];
  serviceFees?: QuoteFee[];
  availableQuotes?: QuoteResponse[];
  quoteErrors?: QuoteProviderError[];

  [key: string]: unknown;
};
