# Business Requirements

## Product

The Wallet is a non-custodial personal swap aggregator and swap assistant.
Users connect wallets, compare quotes from supported swap aggregators, execute
swaps from their own wallet, save favorite pairs, and receive alerts when saved
pairs or reverse-swap profit/loss conditions become important.

The app never stores private keys, never takes custody of funds, and never signs
transactions for users.

## Value Proposition

- Compare swap quotes in one UI instead of visiting several DEX or wallet apps.
- Keep the execution path non-custodial: the user's wallet approves and submits
  transactions.
- Remember useful swap context: history, favorite pairs, thresholds, and
  notification preferences.
- Move beyond a plain swap screen by alerting users when prior or favorite pairs
  may be worth revisiting.

## Revenue Model

- Primary: provider/integrator/platform fee on successful swaps where the
  selected provider supports it.
- Optional later: premium alerting, advanced analytics, or embedded swap
  assistant widgets.

Fee collection must be transparent in product/legal copy before public launch.

## MVP Scope

- Wallet connection through installed wallets and WalletConnect/Reown flows.
- Quote aggregation through configured providers.
- User-signed swap execution.
- Dry-run safeguards for testing.
- Wallet-authenticated swap history.
- Favorite pairs with target-rate alerts.
- Reverse-swap profit and loss-protection monitoring.
- Telegram/email notification plumbing.
- Trade-summary risk cues for high slippage, large fee ratio, and partial route
  outages.
- Admin-gated Auto Swap preference storage, without backend custody of keys.

## Technical Shape

- Next.js frontend and server-side quote route.
- Spring Boot backend for wallet sessions, history, preferences, alerts, and
  scheduled monitoring.
- PostgreSQL for persisted wallet-owned data.
- Vercel for frontend/quote route.
- OCI for backend, PostgreSQL, and Caddy HTTPS proxy.
- Operational health and admin diagnostics for database, monitor, and
  notification-delivery status.

## Security Principles

- Do not store seed phrases, private keys, or signing material.
- Validate and normalize all quote and token inputs server-side.
- Keep provider API keys server-side.
- Treat wallet signatures as authentication only, not transaction approval.
- Scope history, favorites, and preferences to the authenticated wallet.
- Keep fee-recipient, provider, Telegram, SMTP, and database secrets out of git.

## Data Model Areas

- Wallet sessions and nonces.
- Swap history.
- Notification preferences and channel links.
- Favorite pair alert rules.
- Alert delivery/cooldown records.
- Auto Swap preference rules.

## Launch Readiness

Before public launch:

- Confirm fee-recipient and affiliate wallet setup.
- Confirm provider terms for fee-generating use.
- Rotate any exposed notification tokens.
- Maintain public fee disclosure, terms, and privacy pages.
- Keep database backups and uptime/error monitoring enabled.
- Run small real swaps through each enabled provider and verify fee behavior.
