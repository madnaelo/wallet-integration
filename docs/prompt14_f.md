# Prompt 14: Handle Reown Single-Session Wallet Switching

Reown/AppKit may disable wallet options when a wallet session is already active
and the project does not have multi-wallet enabled. The swap form still needs a
clean way to let the user pick a different source wallet when the selected sell
token requires another address family.

## Scope

- Keep the top-right wallet as the primary source wallet for normal EVM swaps.
- If the selected source token requires another wallet family, let the user
  switch source wallets from the token-support notice.
- Before opening a new Reown/AppKit source wallet chooser, disconnect the
  existing Reown namespace so wallet options are selectable.
- Clear source-wallet dependent state when the primary EVM wallet is replaced:
  provider, wallet chain, backend session, saved history display, and stale
  quote state.
- Do not bypass Reown feature gates or spoof multi-wallet availability.
- Keep the user-facing copy product-oriented; avoid implementation terms such as
  namespace, project feature flags, or provider internals.

## Safety Guidance

- Treat this as a source-wallet switch, not a multi-wallet architecture.
- Do not keep stale executable quotes after a wallet switch.
- Do not silently reuse backend sessions signed by a previous wallet.
- Do not disconnect wallets from recipient-address editing; recipient only needs
  an address unless a future explicit import flow is added.
