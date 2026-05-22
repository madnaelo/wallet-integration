# Prompt 12: Add Native Bitcoin Carefully

The swap product needs real `BTC`, not only EVM representations such as `WBTC`
or `cbBTC`.

Implement the first safe native-Bitcoin slice with care. The user should not
need to understand bridge internals or chain-specific execution details to use
the form.

## Scope

Add a native BTC receive flow from supported EVM source assets:

- Keep native `BTC` distinct from wrapped Bitcoin tokens in token metadata and
  search.
- Let the user select BTC as the output asset naturally in the existing buy
  token picker.
- Ask for the Bitcoin receive address only when native BTC is selected.
- Use LI.FI quote data server-side for the EVM-to-BTC transaction request.
- Keep provider API keys and integrator configuration server-side.
- Preserve the current single UI shape for quotes, fees, quote expiry, wallet
  approval, dry-run, and history.

## Safety Guidance

- Do not fake native BTC by renaming an ERC-20 token.
- Do not implement BTC selling until the Bitcoin wallet signing and PSBT path
  is designed explicitly.
- Keep destination addresses in the quote cache key so one user's executable
  quote cannot be reused for another Bitcoin address.
- Treat a mined EVM source transaction as submitted for a cross-chain transfer;
  do not claim destination Bitcoin delivery is final without status tracking.
- Do not modify Bitcoin transaction data or PSBT output structure if a future
  BTC-source flow is added.
