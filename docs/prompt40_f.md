# Prompt 40 - CoW And 1inch Signed Limit Order Coverage

## Product Goal

Expand Limit Orders beyond a single provider while keeping the architecture
non-custodial and aligned with how serious DeFi apps handle delayed execution.

## Requirements

- Support provider-verifiable signed orders instead of backend-controlled swaps.
- Prefer CoW Protocol where available because solver/orderbook execution is a
  well-known non-custodial limit-order pattern.
- Keep 1inch Orderbook as a fallback for supported EVM chains where CoW is not
  selected.
- Store and validate the exact signed order payload before submission.
- Keep unsupported native BTC, non-EVM, cross-chain, and unsupported native
  asset routes as alerts until a safe signed-order adapter exists for those
  exact paths.
- Add provider-specific configuration for optional API keys and partner
  endpoints without requiring a key for the public CoW path.
- Ensure provider selection is returned by the backend so the frontend signs the
  correct typed data for the selected adapter.

## Implementation Guidance

- Validate signed payload fields server-side against the authenticated wallet,
  selected pair, raw amounts, recipient, expiry, provider, and chain.
- Reject mismatched providers or modified payloads.
- Submit CoW orders to the CoW orderbook API and 1inch orders to the 1inch
  orderbook API.
- Save provider order IDs and execution status for auditability.
- Keep private keys, seed phrases, and broad spend permissions out of the
  application.
- Update environment examples and deployment workflows without exposing secrets.

## Safety Guidance

- Do not claim every token pair is executable; only enable execution when a
  signed-order provider can verify the order.
- Do not treat quote availability as execution availability.
- Do not add custodial automation to get broader coverage.
- Real execution still depends on user balance, allowance, provider support,
  solver liquidity, gas economics, and expiry.
