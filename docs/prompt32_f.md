# Prompt 32: Mobile Wallet Return Guidance

## Product Context

Mobile wallet behavior differs by wallet. Binance Wallet returns users to The
Wallet after sign-in and signing, while MetaMask Mobile may keep the wallet app
open and require the user to tap Back manually.

## Requirement

Improve the mobile signing experience without changing wallet security:

- Show wallet-aware signing guidance when history sign-in, token approval, or
  swap signing is waiting for the wallet.
- For MetaMask, explicitly tell the user to approve/sign and then tap Back to
  return to The Wallet.
- Keep the safety reassurance for sign-in messages because they prove wallet
  ownership and cannot move funds.
- Add WalletConnect/Reown redirect metadata so wallets that honor the metadata
  can return to the current The Wallet URL after an approval.

## Technical Guidance

- Do not assume every wallet honors redirect metadata.
- Do not add wallet-specific transaction logic; keep the change limited to UX
  guidance and connection metadata.
- Use the current browser origin for redirect metadata so production, preview,
  and local LAN/mobile URLs remain accurate.
- Avoid exposing new secrets or changing provider API behavior.

## Acceptance Criteria

- MetaMask users see a clear Back-to-The-Wallet hint during sign-in and swap
  approvals.
- Non-MetaMask wallets continue to see clean approve/sign instructions.
- Reown/AppKit receives redirect metadata with the current app URL.
- Frontend typecheck and lint pass.
