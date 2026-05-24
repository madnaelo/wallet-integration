# Prompt 20: Connected Wallet Label

The connected-wallet label should feel familiar to normal wallet users, not
like a raw developer status string.

## Scope

- Replace the top-right `Connected: 0x...` label with a compact connected
  wallet pill.
- Show the connected wallet name when the wallet connector exposes it.
- Continue showing a shortened wallet address so users can distinguish accounts.
- Show the current wallet network when available.
- Let users open the wallet account view from the connected wallet pill.
- Keep the existing disconnect action visible.

## Product Guidance

- Prefer the industry pattern: wallet brand, short address, and network.
- Do not depend on local wallet account nicknames such as MetaMask's
  `Account 1`; most wallets do not expose those labels to dapps.
- If an embedded/social wallet exposes an account label, use it as the primary
  label and keep wallet name, address, and network as supporting details.
- Keep the label compact enough for the header and responsive layouts.

## Safety Guidance

- Do not hide the address entirely; wallet name alone is not enough to
  distinguish accounts.
- Do not invent account names if the wallet does not provide one.
- Preserve the full address in an accessible title/label for copy and
  verification contexts.
