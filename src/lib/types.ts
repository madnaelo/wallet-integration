export type QuoteRouteLine = {
  source: string;
  share: string;
};

export type QuoteFee = {
  label: string;
  amount: string;
  token: string;
};

export type QuoteToken = {
  address: string;
  symbol: string;
  decimals: number;
};

export type QuoteProviderError = {
  providerId: string;
  providerName: string;
  message: string;
  status?: number;
};

export type QuoteResponse = {
  quoteId?: string;
  providerQuoteId?: string;
  bridgeTool?: string;
  providerId?: string;
  providerName?: string;
  executionKind?: "evm-same-chain" | "evm-cross-chain" | "evm-to-bitcoin" | "bitcoin-to-evm" | "solana-source";
  fromChainId?: number;
  toChainId?: number;
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
  gasPrice?: string;
  totalNetworkFee?: string;

  allowanceTarget?: string;
  networkFeeToken?: QuoteToken;
  routeLines?: QuoteRouteLine[];
  serviceFees?: QuoteFee[];
  availableQuotes?: QuoteResponse[];
  quoteErrors?: QuoteProviderError[];
};
