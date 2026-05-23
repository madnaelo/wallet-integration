# Future Idea 1: Import Recipient Address From Wallet

## Idea

Add an "Import from wallet" option inside the recipient-address dialog.

The goal is to make recipient entry easier for users who do not want to paste an
address manually, while still keeping the source wallet stable.

## Product Shape

- Keep the current recipient methods:
  - paste address,
  - scan receive QR,
  - current wallet.
- Add a fourth method: import from wallet.
- The user chooses a wallet, approves a temporary address-read connection, the
  app captures the selected account address, and then the app disconnects that
  temporary session.
- The recipient field stores only the address.

## Feasibility Notes

- WalletConnect/Reown generally returns wallet accounts through a real approved
  session, not through a standard address-only QR handshake.
- The honest UX is therefore "temporary wallet connection to import address",
  not "scan QR without connecting".
- This should not replace paste or receive-QR scanning.

## Open Questions

- Can Reown/AppKit support this cleanly without disturbing the primary source
  wallet when multi-wallet is not enabled?
- Should we build a separate lightweight WalletConnect client for temporary
  recipient import?
- How should we label the flow so users understand it imports an address but
  does not give swap approval or move funds?
