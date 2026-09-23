import type { TokenPickerOption } from "@/components/TokenPicker";
import { buildMockQuote } from "@/lib/server/mockAggregatorClient";
import { parseUnitsSafe, formatUnitsSafe } from "@/lib/units";

export const DEMO_POLICY = Object.freeze({
  revenueEnabled: false, transactionSubmission: false, orderSubmission: false,
  walletSigning: false, providerCredentials: null, treasury: null
});

// Deliberately non-address identifiers. These fixtures cannot identify live assets.
export const DEMO_TOKENS: TokenPickerOption[] = [
  { address: "demo:eth", symbol: "ETH", name: "Ethereum", decimals: 18, networkId: "1", networkName: "Ethereum", isNative: true },
  { address: "demo:usdc", symbol: "USDC", name: "USD Coin", decimals: 6, networkId: "1", networkName: "Ethereum" },
  { address: "demo:arb-usdc", symbol: "USDC", name: "USD Coin", decimals: 6, networkId: "42161", networkName: "Arbitrum" },
  { address: "demo:btc", symbol: "BTC", name: "Bitcoin", decimals: 8, networkId: "20000000000001", networkName: "Bitcoin", isNative: true }
];
export const DEMO_NETWORKS = Array.from(new Map(DEMO_TOKENS.map(t => [t.networkId, { id: t.networkId, name: t.networkName }])).values());
const PRICES: Record<string, bigint> = { "demo:eth": 2500n, "demo:usdc": 1n, "demo:arb-usdc": 1n, "demo:btc": 75000n };

export type DemoQuote = { route: string; output: string; minimum: string; fee: string };

export function demoQuotes(sourceId: string, destinationId: string, amount: string, slippageBps: number): DemoQuote[] {
  const source = DEMO_TOKENS.find(t => t.address === sourceId);
  const destination = DEMO_TOKENS.find(t => t.address === destinationId);
  if (!source || !destination || source === destination || amount.length > 40
    || ![10, 50, 100].includes(slippageBps)) return [];
  const units = parseUnitsSafe(amount, source.decimals);
  if (!units || BigInt(units) <= 0n || BigInt(units) > 1000000n * 10n ** BigInt(source.decimals)) return [];
  const gross = BigInt(units) * PRICES[sourceId] * 10n ** BigInt(destination.decimals)
    / (PRICES[destinationId] * 10n ** BigInt(source.decimals));
  return [20n, 35n].flatMap((feeBps, index) => {
    const fee = gross * feeBps / 10000n;
    const net = gross - fee;
    if (net <= 0n) return [];
    const quote = buildMockQuote({
      chainId: Number(source.networkId), buyChainId: Number(destination.networkId),
      sellToken: sourceId, buyToken: destinationId, sellAmount: units,
      sellTokenSymbol: source.symbol, sellTokenDecimals: source.decimals,
      buyTokenSymbol: destination.symbol, buyTokenDecimals: destination.decimals,
      takerAddress: "demo:sample-wallet", slippageBps
    }, net.toString());
    // Public demo returns display fields only, not calldata, approval targets or revenue IDs.
    return [{ route: index === 0 ? "Sample route A" : "Sample route B",
      output: quote.buyAmount, minimum: quote.minBuyAmount!, fee: fee.toString() }];
  });
}

export function demoAmount(units: string, decimals: number): string {
  return Number(formatUnitsSafe(units, decimals)).toLocaleString("en-US", { maximumFractionDigits: 8 });
}
