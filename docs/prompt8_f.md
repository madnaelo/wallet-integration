# Prompt 8: Quote Several Swap Providers Through One UI

The app should not depend on a single swap provider if other aggregators can
return a better executable route or keep quoting when one provider is
unavailable.

Add multi-provider quote aggregation while keeping one frontend quote model.

## Scope

Implement these two related slices:

1. Provider clients for 0x, 1inch, ParaSwap, and Odos behind one abstraction.
2. A normalized best-quote flow that tolerates individual provider failures.

## Provider Requirements

- Keep a common aggregator client interface.
- Add server-side clients and env configuration for the enabled providers.
- Respect each provider's supported chains and required API key rules.
- Normalize provider quote fields into the app quote model:
  - sell and buy amounts,
  - minimum output when available,
  - allowance target,
  - transaction target/data/value/gas,
  - service fees,
  - network fee estimate,
  - provider identity.
- Keep provider-specific request and response parsing inside the provider layer.

## Aggregation Requirements

- Query eligible providers in parallel.
- Apply a reasonable per-provider timeout.
- Rank successful quotes by the output the user can actually compare.
- Return the best quote for execution and a sanitized list of alternatives for
  UI selection.
- Include provider errors for UI/debug handling without making one provider
  failure fail the whole request.
- Fail only when no eligible provider returns a quote.
- Preserve server-side quote rate limiting and short-lived quote caching.

## Frontend Requirements

- Show a uniform route/provider control regardless of which provider returned a
  quote.
- Switching the selected quote must update the displayed trade summary and the
  executable payload together.
- Do not expose incompatible provider response shapes in the component tree.

## Constraints

- Keep all provider secrets server-side.
- Keep execution non-custodial: the frontend submits only the selected quote
  payload through the user's wallet.
