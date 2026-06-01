# Prompt 41 - Limit Order UX Language, Live Rates, And Recipient Flow

## Product Goal

Make the Limit Orders page understandable and production-polished for normal
users while still giving crypto-literate users enough detail when they want it.

## Requirements

- Replace overly technical default copy with simple user language.
- Add a polished explanation-level selector:
  - Simple,
  - Crypto,
  - Expert.
- Default to Simple mode and explain that funds stay in the user's wallet unless
  a signed order can be filled at the approved price.
- Keep Crypto and Expert modes available for users who want more precise
  signed-order and provider language.
- Replace fake target-rate chart points with live quote-derived recent rate
  samples.
- Let users click a recent live rate point to populate their target rate.
- Reuse the same recipient-address model as the Swap page:
  - current wallet,
  - paste address,
  - scan QR,
  - import wallet address.
- Fix basic pairs such as ETH to USDT so they do not incorrectly show as
  alert-only.
- For native EVM coins, use the wrapped ERC-20 token form for signed limit
  orders and explain this clearly in the UI.

## Implementation Guidance

- Keep the copy user-facing; avoid raw implementation errors such as
  "Failed to fetch".
- Do not present random chart points as market data.
- Use existing quote infrastructure for recent rate samples rather than adding
  a second price engine.
- Keep recipient editing read-only by default and use the pencil icon to open
  the same style of focused recipient dialog used on Swap.
- Do not disturb the primary connected wallet when importing only a recipient
  address.
- Preserve the non-custodial signed-order security model.

## Safety Guidance

- Native BTC must not be remapped to an EVM wrapped token automatically.
- EVM native coins may be normalized to their wrapped contract token only for
  signed order protocols, and the UI must disclose that behavior.
- If live rates or capability checks fail, show a friendly retry message instead
  of technical network errors.
- Keep unsupported pairs alert-only until a provider-verifiable signed-order
  adapter exists.
