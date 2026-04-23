export function buildQuoteUrl(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
}) {
  const sp = new URLSearchParams();
  sp.set("chainId", String(params.chainId));
  sp.set("sellToken", params.sellToken);
  sp.set("buyToken", params.buyToken);
  sp.set("sellAmount", params.sellAmount);
  sp.set("takerAddress", params.takerAddress);
  return `/api/quote?${sp.toString()}`;
}
