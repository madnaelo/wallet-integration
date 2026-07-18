export type TokenInfo = {
  symbol: string;
  address: string; // ERC20 address, "ETH", or a provider-native asset id.
  decimals: number;
  isNative?: boolean;
  name?: string;
  searchAliases?: string[];
  assetKind?: "evm" | "bitcoin";
  addressFamily?: "evm" | "bitcoin";
  walletNamespace?: "eip155" | "bip122";
  networkId?: string;
  networkName?: string;
};

export const NATIVE_BITCOIN_TOKEN_ADDRESS = "bitcoin";
export const NATIVE_BITCOIN_NETWORK_ID = "bip122:bitcoin";

export const NATIVE_BITCOIN_TOKEN: TokenInfo = {
  symbol: "BTC",
  address: NATIVE_BITCOIN_TOKEN_ADDRESS,
  decimals: 8,
  isNative: true,
  name: "Bitcoin",
  searchAliases: ["BTC", "Bitcoin", "Native Bitcoin"],
  assetKind: "bitcoin",
  addressFamily: "bitcoin",
  walletNamespace: "bip122",
  networkId: NATIVE_BITCOIN_NETWORK_ID,
  networkName: "Bitcoin network"
};

export function isNativeBitcoinToken(token: Pick<TokenInfo, "address" | "assetKind"> | string): boolean {
  if (typeof token === "string") return token.trim().toLowerCase() === NATIVE_BITCOIN_TOKEN_ADDRESS;
  return token.assetKind === "bitcoin" || isNativeBitcoinToken(token.address);
}

export const DEFAULT_TOKENS_BY_CHAIN: Record<number, TokenInfo[]> = {
  11155111: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true, name: "Ether", searchAliases: ["Ethereum"] },
    { symbol: "WETH", address: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI", address: "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357", decimals: 18, name: "Dai Stablecoin" }
  ],
  1: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true, name: "Ether", searchAliases: ["Ethereum"] },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6, name: "Tether USD" },
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "WBTC",
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      decimals: 8,
      name: "Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Wrapped Bitcoin"]
    },
    {
      symbol: "cbBTC",
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      decimals: 8,
      name: "Coinbase Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Coinbase Bitcoin"]
    },
    { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "LINK", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18, name: "Chainlink" },
    { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18, name: "Uniswap" }
  ],
  137: [
    { symbol: "POL", address: "ETH", decimals: 18, isNative: true, name: "Polygon Ecosystem Token", searchAliases: ["MATIC", "Polygon"] },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AaCBa0CbFfC", decimals: 6, name: "Tether USD" },
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    { symbol: "USDC.e", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6, name: "Bridged USD Coin" },
    {
      symbol: "WBTC",
      address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
      decimals: 8,
      name: "Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Wrapped Bitcoin"]
    },
    { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "LINK", address: "0xb0897686c545045aFc77CF20eC7A532E3120E0F1", decimals: 18, name: "Chainlink" }
  ],
  8453: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true, name: "Ether", searchAliases: ["Ethereum"] },
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "cbBTC",
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      decimals: 8,
      name: "Coinbase Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Coinbase Bitcoin"]
    },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
    { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 18, name: "Chainlink" }
  ],
  42161: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true, name: "Ether", searchAliases: ["Ethereum"] },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebe478A1C0b69FCbb9", decimals: 6, name: "Tether USD" },
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "WBTC",
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      name: "Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Wrapped Bitcoin"]
    },
    { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18, name: "Arbitrum" },
    { symbol: "LINK", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18, name: "Chainlink" }
  ],
  10: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true, name: "Ether", searchAliases: ["Ethereum"] },
    { symbol: "USDT", address: "0x94b008aD9eC95854314bF3F5f9b71E7ceB2A6B3", decimals: 6, name: "Tether USD" },
    { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "WBTC",
      address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
      decimals: 8,
      name: "Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Wrapped Bitcoin"]
    },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI", address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "OP", address: "0x4200000000000000000000000000000000000042", decimals: 18, name: "Optimism" },
    { symbol: "LINK", address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6", decimals: 18, name: "Chainlink" }
  ],
  56: [
    {
      symbol: "BNB",
      address: "ETH",
      decimals: 18,
      isNative: true,
      name: "BNB",
      searchAliases: ["Binance Coin", "BNB Chain"]
    },
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, name: "Tether USD" },
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "BTCB",
      address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
      decimals: 18,
      name: "Bitcoin BEP2",
      searchAliases: ["BTC", "Bitcoin", "Binance Bitcoin"]
    },
    { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18, name: "Wrapped BNB" },
    {
      symbol: "ETH",
      address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      decimals: 18,
      name: "Ethereum Token",
      searchAliases: ["Ethereum"]
    },
    { symbol: "DAI", address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", decimals: 18, name: "PancakeSwap" }
  ],
  43114: [
    {
      symbol: "AVAX",
      address: "ETH",
      decimals: 18,
      isNative: true,
      name: "Avalanche",
      searchAliases: ["Avalanche C-Chain"]
    },
    { symbol: "USDT", address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6, name: "Tether USD" },
    { symbol: "USDC", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6, name: "USD Coin" },
    NATIVE_BITCOIN_TOKEN,
    {
      symbol: "WBTC.e",
      address: "0x50b7545627a5162F82A992c33b87aDc75187B218",
      decimals: 8,
      name: "Wrapped BTC",
      searchAliases: ["BTC", "Bitcoin", "Wrapped Bitcoin"]
    },
    { symbol: "WAVAX", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18, name: "Wrapped AVAX" },
    { symbol: "WETH.e", address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", decimals: 18, name: "Wrapped Ether" },
    { symbol: "DAI.e", address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18, name: "Dai Stablecoin" },
    { symbol: "LINK.e", address: "0x5947BB275c521040051D82396192181b413227A3", decimals: 18, name: "Chainlink" }
  ]
};
