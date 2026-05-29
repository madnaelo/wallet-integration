# Prompt 32: Mobile Wallet Return Guidance

## Product Context

Mobile wallet behavior differs by wallet. Some wallets return users to The
Wallet after sign-in and signing, while others keep the wallet app open and
require the user to return manually.

## Requirement

Improve the mobile signing experience without changing wallet security:

- Show wallet-aware signing guidance when history sign-in, token approval, or
  swap signing is waiting for the wallet.
- Keep the return guidance generic for all wallets: approve or sign in the
  wallet, then return to Swap Assistant.
- Keep the safety reassurance for sign-in messages because they prove wallet
  ownership and cannot move funds.
- Add WalletConnect/Reown redirect metadata so wallets that honor the metadata
  can return to the current Swap Assistant URL after an approval.

## Technical Guidance

- Do not assume every wallet honors redirect metadata.
- Do not add wallet-specific transaction logic; keep the change limited to UX
  guidance and connection metadata.
- Use the current browser origin for redirect metadata so production, preview,
  and local LAN/mobile URLs remain accurate.
- Avoid exposing new secrets or changing provider API behavior.

## Acceptance Criteria

- Users see clear approve/sign and return-to-The-Wallet guidance during
  sign-in and swap approvals.
- Reown/AppKit receives redirect metadata with the current app URL.
- Frontend typecheck and lint pass.
