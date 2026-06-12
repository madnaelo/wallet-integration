# Backend Execution, Price Alerts, And Limit Orders

Status: decision updated on 2026-05-30.

## Decision

Do not implement autonomous backend transaction signing or custody.

Swap Assistant remains non-custodial: the backend must not store seed phrases,
private keys, raw wallet signing material, or broadly reusable wallet
authorizations. Backend execution can only happen without opening the user's
wallet when the user has first created a narrow, revocable, auditable execution
authorization.

The first implementation path is a dedicated Limit Orders module for supported
EVM contract-token pairs. The frontend builds a provider-verifiable limit order,
the user signs the exact terms in their wallet, and the backend submits only
that signed payload through the configured CoW Protocol or 1inch adapter after
validating maker, chain, assets, amounts, recipient, and payload hash.

## Why This Is Blocked For The Current Wallet Model

The current app connects ordinary user wallets through Reown/AppKit. That gives
the frontend a wallet address and lets the user approve signatures or
transactions in their wallet app. It does not give the backend signing power.

For arbitrary pairs across EVM chains, native BTC, and future non-EVM networks,
there is no single provider-neutral API that lets our backend move user funds
later without one of these authorization models:

- a provider-native signed limit order or intent,
- a smart account/session key with scoped spend and expiry limits,
- a purpose-built escrow/contract flow,
- or custody/private keys, which this product must not use.

0x documentation confirms that Swap API quotes produce executable calldata that
still needs a wallet transaction, while 0x protocol orders are signed by the
maker and currently focus on ERC20-style order flows. That is useful for a
future EVM-only signed-order adapter, but it is not a universal execution layer
for every pair we expose.

## Current Safe Product Behavior

The existing Set Alerts feature stores:

- pair,
- sell amount,
- target rate,
- above/below direction,
- slippage tolerance,
- recipient address,
- notification settings.

When the target is reached, the backend sends a notification with a prefilled
swap link. The user then reviews the live quote and approves the transaction in
their wallet.

This is intentionally `notify_to_confirm` with `confirmation_required` execution
readiness.

The Limit Orders module is separate from the alert-to-confirm Set Alerts rule
storage. Limit Orders can submit signed EVM contract-token orders through the
configured provider adapters. Native BTC, native assets, cross-chain routes, and
non-EVM pairs remain blocked from automatic execution until a matching
provider-verifiable adapter exists.

## Production-Grade Path To Real Backend Execution

Implement real backend execution in phases:

1. Keep the current alert-to-confirm flow as the default for all unsupported
   pairs.
2. Add provider-specific signed-order adapters one surface at a time.
3. Require the frontend to collect an explicit wallet signature for that exact
   order/intent, including:
   - chain,
   - sell token,
   - buy token,
   - sell amount,
   - minimum buy amount or target rate,
   - fee recipient/affiliate terms,
   - expiry,
   - cancellation path,
   - scoped allowance/permit requirements.
4. Store the signed order/intent in PostgreSQL with status, expiry, cancellation
   metadata, and a full audit trail.
5. Add a backend execution worker that submits only supported signed orders when
   provider-side validation still passes.
6. Keep native BTC and unsupported pairs on alert-to-confirm until a safe PSBT
   or provider-native intent model exists for them.

## Required Product Decision Before Implementation

Before coding real execution, choose the first execution model:

- signed limit orders/intents through one provider,
- smart-account/session-key automation,
- or a custom contract/escrow route.

For the current non-custodial consumer app, the recommended first step is a
provider-specific signed-order pilot for a small EVM ERC20 surface. Do not
promise "all available pairs" until each network/token path has a safe delegated
execution mechanism.
