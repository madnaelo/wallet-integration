# Prompt 7: Make The Trade Summary Honest And User-Facing

The current quote UI exposes swap data, but swap language must be precise.
Users should understand what they sell, what fee-bearing output was quoted,
what they receive, and what network cost is separate.

Use mainstream exchange and wallet UX as inspiration, but keep the app's
non-custodial and aggregator model explicit in the data handling.

## Scope

Implement these two related slices:

1. Correct trade-summary semantics for rates, receive amounts, service fees, and
   network costs.
2. Polish route/provider selection and visible labels for normal users.

## Summary Requirements

- Keep the sell amount as the amount quoted for the swap.
- Treat gas/network cost as a separate cost paid in the chain native token.
- Distinguish gross quoted output from output after provider/platform service
  fees when the provider exposes both.
- Do not label an amount "after fees" unless the math supports it.
- Show a minimum received value controlled by slippage.
- Show estimated costs without forcing long fee values into one cramped row.
- Use a fee breakdown only where it makes the summary clearer.
- Do not duplicate one provider/platform fee under confusing labels.

## Rate And Route UX

- Show a pair rate in normal token language.
- Let the user invert the displayed rate direction.
- When multiple provider quotes are available, show a uniform route/provider
  selector with the output users can compare.
- Keep route/provider details readable without exposing raw transaction payloads.
- Hide low-value route-fill noise when the selected swap provider already
  communicates the meaningful choice.

## Copy And Layout Guidance

- Use customer-facing labels only.
- Remove implementation notes from the portal.
- Keep long native-token and destination-token fee values readable on narrow
  widths.
- Keep the main header and summary aligned with the product name:
  "The Wallet" and "Your Personal Swap Aggregator."

## Out Of Scope

- Do not add exact-output input quoting in this pass.
- Do not turn the home screen into a marketing page.
