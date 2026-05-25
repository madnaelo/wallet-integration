# Prompt 28: Admin-Gated Auto Swap Preferences

## Product Context

The Wallet is evolving from manual swap aggregation into a personal swap
assistant. Users should eventually be able to define target-rate swap rules that
the backend can act on when safe non-custodial execution is available.

## Requirement

Add an Auto Swap workflow that is globally controlled by an admin feature
switch:

- When the feature is disabled, users should not see Auto Swap in the UI.
- The backend must also reject Auto Swap APIs while the feature is disabled.
- When enabled, users can save an Auto Swap rule for any pair available in the
  current token-selection experience.
- A rule must include the selected pair, sell amount, threshold rate, direction,
  slippage tolerance, recipient address, and execution preference.
- The product must support both automatic-ready pairs and pairs that require
  user confirmation when the target is reached.

## Technical Guidance

- Keep the product non-custodial. Do not store private keys and do not let the
  backend create arbitrary wallet transactions.
- Store the global feature flag in the backend database with an admin-protected
  API so it can be changed without redeploying.
- Expose a public feature-status endpoint for the frontend.
- Persist Auto Swap rules in PostgreSQL under the authenticated wallet.
- Use generic token/address capability logic. Avoid hard-coded BTC-specific
  branches unless a provider requires them and the trade-off is discussed.
- Treat actual signed-order submission as a separate execution adapter layer;
  this prompt establishes the safe preferences/rules foundation.

## Acceptance Criteria

- Auto Swap is hidden when the feature flag is disabled.
- Auto Swap appears as a navigation item when the backend flag is enabled.
- Users can add/remove Auto Swap rules for the currently selected pair.
- Same-pair target rates must have a sensible minimum gap.
- The backend has tests for feature gating, target spacing, and execution-mode
  normalization.
- Local verification includes backend tests, frontend typecheck, Flyway
  migration smoke, and a browser smoke of the Auto Swap page.
