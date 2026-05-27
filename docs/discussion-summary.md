# Discussion Summary

This file keeps the durable product decisions from the early conversation. The
current implementation details live in `README.md`, `docs/local-and-deployment.md`,
`docs/ci-cd.md`, and the numbered prompt files.

## Product Positioning

The stronger product is not a generic swap screen. It is a non-custodial swap
assistant that combines quote aggregation with memory and alerts:

- favorite token pairs,
- wallet-owned swap history,
- reverse-swap profit and loss-protection checks,
- target-rate notifications,
- user-controlled execution through their own wallet.

## Non-Custodial Boundary

- The app never stores private keys.
- The backend never signs user transactions.
- Users approve token allowances and submit swaps from their wallet.
- Backend wallet signatures authenticate history, favorites, preferences, and
  notification settings only.

## Swap UX Decisions

- Show user-facing trade information, not raw calldata or gas internals.
- Keep gas/network cost separate from the token sell amount.
- Show quoted output, service/provider fees, expected receive, and minimum
  received with clear labels.
- Minimum received is controlled by slippage tolerance.
- Expired quotes remain visible but cannot be executed until refreshed.
- Quote-affecting input changes clear stale quote state.
- Disconnected-wallet prompts should be contextual and non-modal.

## Testing Decisions

- Sepolia is useful for wallet and mock-flow testing, but 0x Swap API does not
  support Sepolia quotes.
- Real API dry-runs on supported mainnet chains are useful for quote parsing and
  fee display without live transaction submission.
- Live swaps require real funds and native gas tokens.

## Notification Decisions

- Favorite-pair alerts and reverse-swap alerts are separate product concepts.
- Loss-protection alerts are opt-in, threshold-based, and use the same efficient
  batched price monitor as reverse-profit alerts.
- Alerts should use thresholds and cooldowns to avoid noisy delivery.
- Telegram linking should use bot start codes; users should not be asked for
  Telegram chat IDs or phone numbers.
- Alert links should deep-link back to the swap page with pair/amount context
  where possible.

## Monetization Decisions

- Revenue should come from provider-supported fee, partner, or integrator
  parameters.
- Provider keys and fee configuration stay server-side.
- Fee collection must be verified with small real swaps before public launch.
- Commercial/API terms must be checked provider by provider.
