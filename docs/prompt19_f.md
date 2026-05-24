# Prompt 19: Generic Token Networks And Recipient Address Families

The token selector should treat token networks generically. Native Bitcoin must
appear under the Bitcoin network, but the UI should not contain display logic
that special-cases BTC by name.

## Scope

- Add Bitcoin network as a first-class network option in the token dropdowns
  when native BTC is present in the available token set.
- Filter token results by the selected network tab:
  - Ethereum tab only shows Ethereum tokens.
  - Polygon tab only shows Polygon tokens.
  - Base tab only shows Base tokens.
  - Bitcoin tab only shows tokens whose metadata says they live on Bitcoin.
  - `All` can show tokens across all available networks.
- Keep the quote chain separate from the token display network so native BTC can
  still be paired with supported EVM source or destination routes.
- Represent wallet compatibility through token metadata such as wallet namespace
  and recipient address family instead of hard-coded token checks.
- Use generic recipient address parsing and validation based on address family.

## Product Guidance

- Users should not need to understand implementation details like quote chain
  routing.
- If a token belongs to a network, it should appear only under that network.
- If a recipient token needs a different address family than the connected
  wallet provides, the user should be guided to provide a compatible recipient
  address through the existing recipient address flow.
- Keep visible UI language product-focused and avoid developer-facing
  explanations.

## Safety Guidance

- Do not infer that an address is valid for every token; validate against the
  selected token's address family.
- Do not show native BTC under an EVM network just because a BTC route can be
  quoted from that EVM chain.
- Do not keep executable quotes after changing token or network selections.
- Token-specific provider execution paths may exist internally, but display and
  recipient decisions should use generic metadata.
