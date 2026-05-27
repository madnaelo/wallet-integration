# Prompt 34 - Add High-Liquidity EVM Networks

## Product Need

The token and network list is too small for a credible swap product. Add more
high-liquidity EVM networks while keeping the app natural for users and safe for
quote execution.

## Prompt

Add Arbitrum One, Optimism, BNB Smart Chain, and Avalanche C-Chain to the app.
Update the chain registry, Reown AppKit networks, swap-provider supported-chain
lists, environment examples, and curated popular-token fallbacks. Keep the token
logic generic: tokens should appear because they belong to a selected network,
not because of special token-specific exceptions.

## Implementation Guidance

- Verify current provider support from primary/provider sources where needed.
- Reuse one shared supported-chain constant across provider clients.
- Add only well-known token addresses and decimals that we are confident about.
- Keep native BTC behavior consistent with the existing LI.FI/native-BTC model.
- Update docs and env examples so local and production configs can enable the
  same chain list.
- Run frontend typecheck/lint before committing.
