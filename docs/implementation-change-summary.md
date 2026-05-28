# Implementation Change Summary

This is a concise historical summary of major implementation areas. The current
operational details live in the README, CI/CD docs, local workflow docs, and the
provider/earning checklist.

## Frontend

- Built the Next.js swap UI around Reown AppKit wallet connection.
- Added source/destination token pickers with network filters, search by symbol
  and name, popular-token ordering, and a pair reversal control.
- Added user-facing quote state: provider options, route/provider selection,
  quote expiry, slippage, service fees, network cost, expected receive, and
  minimum received.
- Added trade-summary risk cues for high slippage, high fee ratio, and partial
  route/provider outages.
- Added dry-run protections and clearer wallet-signing/transaction-approval
  guidance.
- Added responsive mobile behavior for wallet labels, navigation, token
  switcher direction, quote loading feedback, and quote-summary reveal.
- Added Favorites and Preferences as separate app areas.
- Added one-click Open and Reverse actions for saved favorite pairs.

## Quote Route And Providers

- Normalized quote responses across 0x, 1inch, ParaSwap/Velora, Odos, and LI.FI.
- Added provider failure isolation so one failed provider does not block quotes
  from others.
- Added server-side provider API keys, fee parameters, quote caching, and
  per-IP rate limiting.
- Added LI.FI support for native-BTC quote paths while keeping BTC execution as
  a dedicated follow-up.

## Backend

- Added Spring Boot backend with Flyway migrations and PostgreSQL persistence.
- Added wallet-authenticated sessions through signed wallet messages.
- Added wallet-owned swap history.
- Added notification preferences, Telegram linking through bot start codes, and
  email/Telegram delivery adapters.
- Added scheduled monitoring for reverse-swap opportunities and favorite-pair
  thresholds.
- Extended reverse-swap monitoring to support loss protection alerts with
  type-specific alert cooldowns.
- Added Auto Swap preference/rule storage behind an admin feature switch.

## Deployment And Operations

- Added Windows-first local scripts for database, backend, frontend, full-stack
  startup, shutdown, and verification.
- Moved local PostgreSQL to port `56434` to avoid common conflicts.
- Added split production deployment: Vercel for frontend/quote route, OCI for
  backend/PostgreSQL/Caddy.
- Added GitHub Actions CI and automatic deployments for frontend and backend on
  pushes to `master`/`main`.
- Added backend health and admin operations summaries for database, monitor,
  and notification-delivery visibility.

## Security Notes

- Private keys and seed phrases are never requested or stored.
- Provider keys, Telegram tokens, SMTP credentials, database credentials, and
  fee-recipient configuration are kept out of git.
- `NEXT_PUBLIC_*` values are treated as public browser configuration.
- Backend signing is authentication for app data, not transaction execution.
