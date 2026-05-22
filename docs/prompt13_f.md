# Prompt 13: Model Source And Receive Wallets

Move the native Bitcoin work from a Bitcoin-only receive-address field toward
the wallet model the product will need for cross-network swaps.

## Scope

- Keep LI.FI and its server-side API-key configuration for native BTC quote
  paths and future cross-chain support.
- Let the selected source asset decide which connected wallet address pays for
  the quote.
- Let the destination asset decide which connected wallet address pre-fills the
  receive field.
- Keep the receive address editable so a user can send to another wallet when
  needed.
- Add Bitcoin AppKit connection support so BTC source or destination selection
  can ask for a Bitcoin wallet instead of forcing an EVM wallet address into a
  Bitcoin slot.
- Pass explicit receive addresses to quote providers that support them and let
  unsupported providers fail independently.

## Safety Guidance

- A wallet does not need to contain the destination token to receive it; it
  needs to support the destination network/address family.
- Do not treat wrapped EVM Bitcoin tokens as native BTC.
- Do not expose LI.FI or other provider keys in the browser.
- Keep BTC-source signing separate until the Bitcoin PSBT path is implemented
  and tested deliberately.
