# Prompt 39 - Production Limit Orders With Signed Backend Submission

## Product Goal

Add a dedicated Limit Orders module so users can set exact swap terms that may
execute later without opening the wallet again, while keeping Swap Assistant
strictly non-custodial.

## Requirements

- Use the crypto-market term "Limit Orders" instead of generic backend auto
  swap language.
- Keep the module separate from the normal Swap screen.
- Show clear risk warnings and require an explicit terms/risk checkbox.
- Support all token pairs in the UI, but enable automatic execution only when a
  provider/protocol can verify the user's signed order or intent.
- For unsupported routes, block automatic execution instead of pretending the
  backend can safely move funds.
- For the first production adapter, use a provider-verifiable EVM limit-order
  model:
  - frontend builds exact signed order terms,
  - user signs EIP-712 data in their own wallet,
  - backend validates the signed payload against the authenticated wallet,
  - backend submits only the matching signed payload to the configured orderbook
    provider,
  - backend never stores private keys, seed phrases, or broad spend authority.
- Save immutable audit metadata including signed payload hash, order hash,
  execution provider, status, expiry, and timestamps.

## Safety Guidance

- Native BTC, native assets, cross-chain swaps, and non-EVM pairs must remain
  blocked from automatic execution until a safe signed-intent adapter exists for
  that exact path.
- Do not implement custody, private-key storage, or broad reusable wallet
  authorization.
- If any order parameter is changed after signing, the signature must no longer
  be accepted as valid for execution.
