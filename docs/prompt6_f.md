# Prompt 6: Make Wallet Choice And Backend Signing Work Across Wallets

Do not force users to install a browser wallet. The product should work for
users with installed wallets and for users connecting from another device or a
mobile wallet.

Backend history now needs a wallet signature too, so wallet connection and
message signing have to work through the same selected wallet provider.

## Scope

Implement these two related slices:

1. Improve the wallet chooser using a standard multi-wallet connection kit.
2. Harden backend wallet sign-in for injected wallets and WalletConnect-backed
   sessions.

## Wallet Connection Requirements

- Support installed browser wallets when present.
- Support QR/deep-link style wallet connection without requiring
  `window.ethereum`.
- If more than one browser wallet exists, let the user choose through the wallet
  connection experience.
- Use the connected provider returned by the wallet connection library for
  account, chain, signing, and transaction requests.
- Keep the visible UI user-facing and polished. Do not add debugging language to
  the page.
- Do not enable email or social login unless product explicitly asks for it.

## Wallet Sign-In Requirements

- Request backend authentication signatures from the connected EIP-1193
  provider, not from a hard-coded injected browser provider.
- Support the signing method ordering and parameter shapes expected by the
  active wallet session.
- Handle WalletConnect request expiry requirements correctly.
- Give slow mobile signing flows enough time without hiding useful user errors.
- Surface clear sign-in guidance if the wallet rejects the request, does not
  support signing, times out, or disconnects.
- Remove temporary signing diagnostics from the customer UI after the flow is
  verified.

## Constraints

- Do not weaken backend signature verification just to make one wallet work.
- Do not require a public callback URL for normal wallet message signing if the
  provider request/response flow already returns the signature.
- Keep transaction execution user-signed and non-custodial.

## Verification

- Test an injected-wallet path when available.
- Test a WalletConnect-style QR/mobile path.
- Verify backend history sign-in and history loading after reconnecting.
