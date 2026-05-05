
# Discussion Summary

## Original Business Model

The original product was not just a generic swap screen. The stronger business idea is a non-custodial swap assistant:

- Users save favorite token pairs.
- The system monitors swap prices for those pairs.
- Users receive notifications when the quote becomes attractive.
- The system stores past swaps.
- The system checks whether reversing a previous swap could produce profit.

Example:

- User previously swapped `ETH -> USDT`.
- Later the system checks `USDT -> ETH`.
- If the reverse quote returns more ETH than the user originally sold, the app can alert them.

The monetization still comes from swap fees:

- Aggregator/integrator fee on swaps.
- Optional future premium notifications or analytics.
- Optional B2B embedded swap/watchlist widget.

## Product Positioning

A plain swap aggregator competes directly with large wallets and DEX apps such as MetaMask, Coinbase, Uniswap, 1inch, Matcha, and Rabby.

The better positioning is:

> A non-custodial swap intelligence app that watches favorite token pairs, tracks past swaps, and alerts users when a profitable reverse swap may be available.

This makes the app more like a personal swap assistant than a generic swap UI.

## Non-Custodial Model

The app remains non-custodial:

- The app never stores private keys.
- The backend never signs transactions.
- The backend only builds or returns quote/transaction payloads.
- The user's wallet signs and submits transactions.
- Funds never pass through the application.

## 0x and Sepolia Testing

Sepolia was originally included to support end-to-end testing without real funds. That assumption does not work with 0x because the 0x Swap API rejected Sepolia:

```text
Invalid chain ID: 11155111
```

So Sepolia is useful for:

- Wallet connection testing.
- Network switching testing.
- Mock quote testing.
- Future real testnet provider testing.

Sepolia is not useful for real 0x end-to-end swap testing unless a separate Sepolia-supported swap provider is implemented.

## Testing Strategy

There are three testing levels:

1. Mock testing:
   - No real API calls.
   - No real transactions.
   - Good for UI and wallet-flow safety checks.

2. Real API dry-run testing:
   - Calls the real 0x API on a 0x-supported chain.
   - Does not submit approvals or swaps.
   - Good for verifying API calling, quote parsing, fee display, and route handling.

3. Live production testing:
   - Uses real 0x quotes.
   - User signs real wallet transactions.
   - Requires real funds and native gas token.

Current dev direction:

```env
NEXT_PUBLIC_ALLOWED_CHAIN_IDS=1
NEXT_PUBLIC_DISALLOW_MAINNET=true
```

This allows real 0x quote testing on Ethereum Mainnet while keeping the swap button in dry-run behavior.

## Env Simplification

Several duplicate env variables were removed from active configuration:

- `QUOTE_PROVIDER`
- `NEXT_PUBLIC_SWAP_EXECUTION_MODE`
- non-public `ALLOWED_CHAIN_IDS`
- non-public `DISALLOW_MAINNET`

The simplified env model is:

```env
ZEROX_API_KEY=...
NEXT_PUBLIC_ALLOWED_CHAIN_IDS=...
NEXT_PUBLIC_DISALLOW_MAINNET=...
```

Meaning:

- `ZEROX_API_KEY` present: use real 0x quote API.
- `ZEROX_API_KEY` absent and `NEXT_PUBLIC_DISALLOW_MAINNET=true`: fall back to mock quotes.
- `NEXT_PUBLIC_DISALLOW_MAINNET=true`: do not submit live approvals/swaps.
- `NEXT_PUBLIC_DISALLOW_MAINNET=false`: live transaction execution is allowed.

## WalletConnect and Wallet Choice

The WalletConnect QR flow can open mobile wallets such as Binance or Exodus, but for Sepolia/testnet clarity MetaMask Mobile is the safer recommendation.

Reason:

- MetaMask clearly supports testnets such as Sepolia.
- It makes network selection visible.
- It reduces accidental real-network usage during testing.

For real 0x dry-run testing on mainnet, wallet connection is still useful, but the app should not submit transactions while dry-run is enabled.

## Native Gas Token Rules

Every chain requires its native token for network gas:

- Ethereum: ETH
- Base: ETH
- Polygon: MATIC
- BNB Chain: BNB
- Avalanche: AVAX

If a user sells a non-native token, such as `USDC -> USDT`, they still need the native token for gas.

If they have:

```text
100 USDC
0 ETH
```

then an Ethereum swap cannot complete because both approval and swap transactions require ETH for gas.

## Sell Amount vs Total Spend

There are two possible product modes:

1. Sell amount mode:
   - User enters `1 ETH`.
   - App quotes a swap for exactly `1 ETH`.
   - Gas is paid separately by the wallet.

2. Total spend mode:
   - User enters a total budget, for example `1 ETH including gas`.
   - App must estimate gas, subtract it, and quote the remaining amount.
   - This requires a two-step or iterative quote flow.

Most wallet UIs, including MetaMask-style summaries, show the swap amount in the main summary and keep gas as a separate detail.

## Quote Object Explanation

The 0x v2 quote object contains both user-facing data and low-level transaction data.

Important user-facing fields:

- `sellAmount`: base-unit sell token amount.
- `buyAmount`: base-unit expected buy token amount.
- `minBuyAmount`: minimum buy token output after slippage.
- `liquidityAvailable`: whether 0x found a route.
- `route.fills`: which liquidity sources are used.
- `fees`: provider, platform, and gas-related fee objects.
- `totalNetworkFee`: estimated native-token network fee.

Important execution fields:

- `transaction.to`
- `transaction.data`
- `transaction.value`
- `transaction.gas`
- `transaction.gasPrice`

The long `data` field is raw calldata. It is necessary for wallet execution, but it is not useful to show to normal users.

## End-User Trade Summary Direction

The UI should avoid developer-only fields and show only what matters to the user:

- You pay.
- Rate.
- Total fees.
- Expandable fee breakdown.
- You receive.
- Minimum received.

The user-facing fee summary currently converts fees into the destination token when possible, so the app can show a single easy-to-understand total fee line.

Important nuance:

- On-chain gas is still paid in the chain native token.
- The UI may convert network gas into the destination token equivalent for readability.
- The fee breakdown should show the original token as well, for example:

```text
Network fee: 2.52 USDT (0.001080174 ETH)
0x provider fee: 3.509918 USDT
```

## Future Product Features

The features that align best with the original business model are:

- Favorite token pairs.
- Saved wallet-based preferences.
- Historical swap storage.
- Reverse-swap opportunity detection.
- Price/rate notifications.
- Profit threshold alerts.
- Optional notification channels such as email, Telegram, push, or in-app alerts.

