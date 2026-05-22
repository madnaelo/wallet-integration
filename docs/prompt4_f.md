# Prompt 4: Make Quote Testing Safe And Quote Inputs Trustworthy

Continue from the non-custodial Next.js swap MVP and flexible wallet connection
work in the earlier prompts.

The app needs to call real swap quote APIs during development, but I do not want
local testing to accidentally submit live approvals or swap transactions. The
quote form also needs guardrails so the user does not act on stale or invalid
trade data.

## Scope

Implement these two related slices:

1. Safe quote and execution modes for development.
2. A quote form UX that validates inputs, exposes slippage, and invalidates
   stale quote state.

## Safety Requirements

- Keep the app non-custodial.
- Support real aggregator quote calls on configured live chains while local
  execution is in dry-run mode.
- Use an environment guardrail so approvals and swaps are not submitted while
  dry-run is enabled.
- Allow a mock quote fallback only when it is safe and no real quote provider is
  configured.
- Keep chain configuration driven by an allowed-chain registry and environment
  values.
- Do not make Sepolia appear like a real 0x swap E2E path if the provider does
  not support it.

## Quote Form Requirements

- Require a connected wallet before fetching a wallet-specific quote.
- If the user edits swap inputs while disconnected, show a user-facing connect
  prompt near the connect action.
- Validate amount, sell token, buy token, same-token selection, and slippage.
- Show field-level validation feedback rather than only a generic failure.
- Add slippage presets and a validated custom slippage value.
- Send slippage to the quote API in basis points and validate it server-side.
- Clear the current quote whenever chain, amount, token selection, or slippage
  changes.
- Add a quote freshness timer. Keep an expired quote visible, mark it expired,
  and disable execution until the quote is refreshed.

## User-Facing Guidance

- Prefer normal swap language over developer terminology.
- Show clear failures for rejected wallet actions, unavailable liquidity,
  slippage, and network mismatch.
- Keep raw calldata and low-level transaction fields out of the main UI.

## Implementation Guidance

- Keep quote-provider selection modular so real and mock quote clients remain
  separable.
- Use TypeScript validation at the route boundary.
- Avoid duplicated env switches if one guardrail can express the behavior.
- Run type checking after the change and document any required env values.
