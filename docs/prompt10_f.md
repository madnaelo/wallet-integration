# Prompt 10: Improve Chain And Token Selection Ergonomics

The swap selectors need to feel closer to a real product. Users should see the
enabled chains, get sensible token defaults for the selected chain, and be able
to reverse a pair quickly.

## Scope

Implement these two related slices:

1. Chain selection that follows configured supported networks and defaults to
   the connected wallet chain when possible.
2. Better token selector ergonomics for the curated MVP token list.

## Chain Requirements

- Keep the chain dropdown for same-chain swaps.
- Do not silently turn same-chain swaps into cross-chain bridge behavior.
- Populate the dropdown from configured allowed chains.
- Make the connected wallet chain the selected chain when it is allowed.
- Reset token selections and stale quote state when the selected chain changes.
- Keep provider chain support in mind so the UI does not advertise dead paths.

## Token Requirements

- Expand the curated token list with verified common tokens for the supported
  networks.
- Keep symbols, addresses, decimals, and native-token handling chain-specific.
- Distinguish native and bridged variants where users need that distinction.
- Add a small left/right pair reversal control between sell and buy selectors.
- Clear stale quote state when the pair is reversed.

## Product Guidance

- Do not manually dump hundreds of untrusted tokens into a basic dropdown.
- Treat a searchable token picker, token registry strategy, recent/favorite
  tokens, and import-by-address risk warnings as the next token-list product
  slice.
- Keep this pass compact and polished.
