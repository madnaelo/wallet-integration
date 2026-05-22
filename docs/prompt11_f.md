# Prompt 11: Expand Same-Chain Token Discovery And Hide Network Complexity

The current swap form proves same-chain quoting, but the visible token set is
too small for a real swap product. Exchanges and swap tools expose far more
assets than a seven-token curated dropdown.

Keep the product same-chain for now. Do not add cross-chain bridging in this
pass.

## Scope

Implement these two related slices:

1. A searchable same-chain token picker backed by trusted token metadata
   sources.
2. A less technical network selection experience.

## Token Discovery Requirements

- Replace small native token dropdowns with a searchable token picker.
- Keep native tokens and carefully curated popular tokens available immediately
  and pinned above the long tail.
- Load a much larger chain-filtered token registry for supported mainnets.
- Prefer standard Token List metadata where suitable and merge additional
  configured provider token metadata when it safely increases coverage.
- Keep token metadata server-side authoritative for quote validation. The quote
  route must validate against the same registry the UI receives.
- Cache token metadata so quote requests do not repeatedly reload large token
  sources.
- Keep token search same-chain:
  - Ethereum tokens while Ethereum is selected,
  - Polygon tokens while Polygon is selected,
  - Base tokens while Base is selected.
- Search by user language and precise identifiers:
  - symbol/ticker,
  - display name,
  - aliases for familiar assets whose on-chain symbol differs,
  - contract address.
- Rank exact symbol, alias, name, and address matches before loose substring
  matches.
- Fall back to popular tokens with a user-facing notice if the larger list is
  temporarily unavailable.

## Network UX Requirements

- Continue defaulting to the connected wallet chain when it is supported.
- Do not make a large chain dropdown the first decision in the swap form.
- Move network switching into a compact network control near wallet state.
- Keep network switching possible for users who want it.
- Clear stale token and quote state when the active network changes.

## Safety Guidance

- Do not manually paste thousands of unreviewed token rows into source code.
- Do not treat list membership as a guarantee that a token is risk-free.
- Keep provider API keys and token-source authentication server-side.
