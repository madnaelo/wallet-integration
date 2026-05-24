# Prompt 17: Import Recipient Address From Wallet

The recipient-address dialog should support importing an address from another
wallet without disturbing the primary source wallet that is already connected
for the swap.

## Scope

- Add an "Import wallet" method beside the existing recipient methods:
  - paste address,
  - scan receive QR,
  - current wallet.
- Use a temporary WalletConnect session dedicated only to recipient-address
  import.
- Show a QR code for the temporary import session.
- After the user approves the temporary session, capture the selected account
  address and store only that address in the recipient field.
- Disconnect the temporary session after the address is captured.
- Keep the primary Reown/AppKit wallet session intact.
- Keep native BTC recipient handling honest:
  - support paste and receive-QR scan for BTC addresses,
  - do not pretend an EVM WalletConnect account is a BTC recipient address.

## Product Guidance

- Label the flow as address import, not as a second connected wallet.
- Explain through short UI state text that the wallet is being used to share an
  address only.
- Preserve the compact recipient row; the pencil icon remains the entry point.
- Keep failures recoverable with paste and QR scanning as fallbacks.

## Safety Guidance

- Do not disconnect or replace the primary source wallet during recipient import.
- Do not request transaction signing or token approvals from the temporary
  recipient import session.
- Do not store session details after import; store only the recipient address.
- Clear stale quotes after changing the recipient address.
- Validate the imported address against the selected destination asset before
  saving it.
