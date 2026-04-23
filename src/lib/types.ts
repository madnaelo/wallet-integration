export type QuoteResponse = {
  price?: string;
  buyAmount: string;
  sellAmount: string;

  to: string;
  data: string;
  value?: string;
  gas?: string;

  allowanceTarget?: string;

  [key: string]: unknown;
};
