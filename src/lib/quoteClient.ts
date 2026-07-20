export function buildQuoteUrl(params: {
  fromChainId: number;
  toChainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
  toAddress?: string;
  slippageBps?: number;
}) {
  const sp = new URLSearchParams();
  sp.set("fromChainId", String(params.fromChainId));
  sp.set("toChainId", String(params.toChainId));
  sp.set("sellToken", params.sellToken);
  sp.set("buyToken", params.buyToken);
  sp.set("sellAmount", params.sellAmount);
  sp.set("takerAddress", params.takerAddress);
  if (params.toAddress) sp.set("toAddress", params.toAddress);
  if (typeof params.slippageBps === "number") sp.set("slippageBps", String(params.slippageBps));
  return `/api/quote?${sp.toString()}`;
}
