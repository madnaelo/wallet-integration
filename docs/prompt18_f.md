# Prompt 18: Move Network Selection Into Token Menus

The swap UI should not expose a global chain selector in the header. Users
expect network choice to live inside the token selectors, similar to major
wallet swap experiences.

## Scope

- Remove the global network selector from the header.
- Add network filters inside both token dropdowns:
  - `All`,
  - each configured EVM network such as Ethereum, Polygon, and Base.
- Let token search work across the currently selected network filter.
- In `All`, show tokens from every allowed network with the network name visible
  in each result.
- Selecting a token from another network should switch the active swap network
  and clear stale quote state.
- Keep same-chain swap execution as the current supported execution model.
- Preserve the existing source and destination token layout, including the
  left-right swap button position.

## Product Guidance

- Network selection should feel like part of token selection, not a separate
  developer configuration step.
- Search should match token symbol, token name, aliases, address, and network
  name.
- Popular and curated tokens should remain easy to find before long-tail remote
  token-list entries.
- Do not add technical explanations to the visible user interface.

## Safety Guidance

- Do not quote across two EVM networks unless a deliberate cross-chain execution
  path is selected and tested.
- Do not keep old executable quotes after switching the active network.
- Do not silently reuse a recipient address if changing the destination asset
  makes that address format invalid.
- Continue validating source wallet compatibility with the selected source
  asset.
