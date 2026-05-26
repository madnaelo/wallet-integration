# Prompt 30: Telegram Alert Deep Links

## Product Context

Telegram alerts should not merely tell the user that a price condition was met.
They should return the user to The Wallet with the relevant swap already set up
so the user can immediately refresh the live quote and decide whether to trade.

## Requirement

Make Telegram alert links smart and actionable:

- Reverse-swap profit alerts should link to the reverse pair, using the token
  amount received in the original swap as the sell amount for the reverse quote.
- Favorite-pair alerts should link to the saved pair without forcing an amount.
- Production alerts should use the configured public app URL.
- Local development alerts should avoid `localhost` when possible and use a LAN
  IPv4 URL that can be opened from a mobile wallet device on the same network.
- The frontend swap page must consume the link parameters and prefill chain,
  sell token, buy token, and amount when present.

## Technical Guidance

- Keep URL generation in the backend notification formatter so email and
  Telegram can share the same action link later.
- Do not put provider API keys, Telegram tokens, or wallet secrets in links.
- Use normal query parameters plus the Swap view hash; avoid hidden local
  storage state for alert links.
- If a token list is still loading, preserve the linked token choice until the
  list resolves instead of immediately falling back to defaults.

## Acceptance Criteria

- Reverse-profit alert bodies contain a prefilled swap URL with reversed tokens
  and `sellAmountRaw`.
- Favorite-pair alert bodies contain a prefilled swap URL for the saved pair.
- A URL such as
  `/?chainId=1&sellToken=ETH&buyToken=USDT&sellAmountRaw=1000000000000000000#swap`
  opens the swap screen with those values selected when the tokens are
  available.
- Backend formatter tests, frontend typecheck, and lint pass.
