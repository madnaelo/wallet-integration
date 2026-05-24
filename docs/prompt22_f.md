# Prompt 22: Reverse-Swap Profit Notifications

Build the backend foundation for reverse-swap profit alerts. When a user has
past swap history and the market has moved enough that swapping the received
token back could return more of the original token, the backend should notify
the user through configured channels.

## Scope

- Add database tables for wallet notification preferences and delivered alert
  records.
- Add authenticated backend APIs to read and update notification preferences.
- Support email and Telegram delivery adapters behind environment flags.
- Add a scheduled backend monitor that evaluates historical swaps.
- Avoid quote-provider rate limits by batching market price reads before
  evaluating candidate swaps.
- Persist alert delivery attempts and enforce a cooldown per swap and channel.

## Product Guidance

- Treat the first calculation as an indicative opportunity, not an executable
  quote.
- Alert only when the estimated reverse return clears the wallet's configured
  profit threshold.
- Keep dry-run quote previews out of default alerts unless explicitly enabled
  in configuration.
- Notification copy should tell users to check a live quote before swapping.

## Technical Guidance

- Use a single batched price source for the pre-screen rather than calling every
  swap provider for every historical pair.
- De-duplicate token references before pricing.
- Keep provider API keys and delivery credentials in environment variables.
- Do not block the monitor on one failed notification channel.
- Prevent overlapping scheduler runs.

## Safety Guidance

- Never send private keys, seed phrases, signatures, or bearer tokens through
  notifications.
- Store only delivery targets and alert metadata needed for cooldown and audit.
- Make email and Telegram globally disabled by default until credentials are
  configured.
- Keep the message clear that the opportunity is an estimate, because final
  swap output depends on liquidity, slippage, fees, and route availability.
