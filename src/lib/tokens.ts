export type TokenInfo = {
  symbol: string;
  address: string; // ERC20 address or "ETH"
  decimals: number;
  isNative?: boolean;
};

export const DEFAULT_TOKENS_BY_CHAIN: Record<number, TokenInfo[]> = {
  11155111: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true },
    { symbol: "WETH", address: "0x7b79995e5f793a07bc00c21412e50ecae098e7f9", decimals: 18 },
    { symbol: "DAI", address: "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357", decimals: 18 }
  ],
  1: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true },
    { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
    { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 }
  ],
  137: [
    { symbol: "MATIC", address: "ETH", decimals: 18, isNative: true },
    { symbol: "USDC", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
    { symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
    { symbol: "DAI", address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 }
  ],
  8453: [
    { symbol: "ETH", address: "ETH", decimals: 18, isNative: true },
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 }
  ]
};
