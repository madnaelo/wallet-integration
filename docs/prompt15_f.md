# Prompt 15: Collect Recipient Address Without Forcing Wallet Connection

The receive side of the swap only needs a recipient address. A wallet does not
need to be connected or hold the destination token just to receive funds.

Replace the recipient wallet-connection flow with an address-selection flow that
does not disturb the primary source wallet.

## Scope

- Keep the visible recipient row compact and read-only by default.
- Keep the pencil icon as the entry point for changing the recipient.
- When the pencil is clicked, open a focused recipient-address dialog.
- Provide these recipient methods:
  - paste address,
  - scan a receive QR code,
  - use the currently connected compatible wallet address.
- Validate recipient address format against the selected destination asset:
  - EVM assets require an EVM address,
  - native BTC requires a Bitcoin address.
- Parse common QR/address payloads where safe:
  - raw EVM addresses,
  - Ethereum-style strings containing an EVM address,
  - raw Bitcoin addresses,
  - `bitcoin:` URI payloads.
- If camera QR scanning is unavailable or permission is denied, keep paste as
  the fallback.

## Safety Guidance

- Do not open Reown/AppKit from the recipient pencil in this flow.
- Do not disconnect the primary source wallet while editing the recipient.
- Do not claim that a pasted or scanned address is owned by the current user.
- Clear stale quote state after changing the recipient address.
- Keep validation messages user-facing and direct.
