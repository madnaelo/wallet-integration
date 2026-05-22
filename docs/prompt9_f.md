# Prompt 9: Configure Monetization And Provider Operations

The business model depends on swap fees, and provider access should not rely on
anonymous public limits where an API key or integrator configuration is
available.

Add the fee and provider configuration carefully so live values can be supplied
later without hard-coding secrets or wallet addresses.

## Scope

Implement these two related slices:

1. Platform fee and recipient configuration across supported providers.
2. Provider/env documentation that is practical for local work and deployment.

## Fee Configuration Requirements

- Add placeholder fee-recipient and affiliate wallet settings in environment
  examples.
- Centralize fee basis-point parsing and validation.
- Do not enable live fee collection when the recipient is still a zero-address
  placeholder.
- Pass the provider-appropriate fee or partner fields to 0x, 1inch, ParaSwap,
  and Odos where supported by the current integration.
- Preserve normalized service-fee display in the frontend.
- Use one wallet setting where provider APIs allow it, and separate config only
  where a provider requires different data.

## Provider Access Requirements

- Support server-side API keys for providers that require them.
- Add optional ParaSwap API key support and make the header configurable to match
  the issued key contract.
- Keep Odos endpoint/key settings configurable.
- Keep 1inch and 0x keys server-only.
- If a provider cannot quote due to access or rate limit failure, allow other
  configured providers to continue.

## Documentation Requirements

- Update environment examples with every new required or optional variable.
- Keep real keys out of git.
- Make local and deployment commands copy-paste friendly, especially for Windows
  PowerShell local setup.
- Explain what the product owner must replace before live fee collection.
