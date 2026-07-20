# Swap Assistant

Swap Assistant is a non-custodial personal swap assistant. It connects a user's
wallet, compares quotes from configured swap providers, lets the wallet execute
the selected swap, and stores wallet-owned swap history for the product path
toward favorite pairs, reverse-swap profit checks, and notifications.

The application never stores private keys, never takes custody of funds, and the
backend never signs swap transactions.

## Current Product

Implemented:

- Next.js App Router frontend with ethers-based wallet transaction execution.
- Reown AppKit wallet connection for installed wallets and WalletConnect-style
  QR/mobile flows.
- Same-chain swap selection for configured Ethereum, Arbitrum, Optimism, Base,
  Polygon, BNB Smart Chain, and Avalanche networks. The connected wallet chain
  is selected when it is allowed.
- Searchable token pickers backed by cached token-list/provider metadata,
  native/popular-token fallbacks, native BTC selection, and a sell/buy reversal
  control.
- `GET /api/quote` with validation, per-IP rate limiting, and short quote cache.
- Confirmed-fee production routing through 0x for same-chain EVM swaps and
  LI.FI for native-Bitcoin paths. Dormant 1inch, ParaSwap, and Odos adapters
  cannot be enabled until their fee terms are recorded as confirmed.
- Provider failure isolation: one timed-out or rejected provider does not hide
  successful quotes from other configured providers.
- User-facing trade summary with slippage, quote expiry, provider selection,
  receive/minimum-received amounts, service fees, network cost, and visible
  risk cues for high slippage, large service-fee ratio, or partial route
  outages.
- Dry-run guardrails for real quote testing without accidental live swaps.
- Spring Boot and PostgreSQL backend for signed wallet sessions and swap
  history.
- Collapsed swap history panel that loads authenticated history on demand and
  stores dry-run, submitted cross-chain, or confirmed swaps.
- Backend notification preferences, scheduled reverse-swap profit/loss scanning,
  and email, Telegram, and browser push delivery adapters. Alert checks batch
  market price reads before evaluating historical swaps.
- Wallet-owned favorite pairs with optional target-rate Telegram/email/push alerts
  using above/below thresholds.
- Page-like navigation for Swap, Favorites, and Preferences. Telegram is linked
  through the bot flow instead of asking users for a chat ID.
- Installable PWA shell with a service worker, offline fallback, and device-level
  browser alerts from the Preferences page.
- Intro/trust page and first-time Swap guide that explain wallet connection,
  sign-in, quote review, and transaction approval in user-friendly terms.
- Favorite pairs can be added from the Swap or Favorites pages, including
  laddered target alerts for the same pair when prices are at least 1% apart.
- Favorite pairs can be opened or reversed from the Favorites page using the
  same prefilled swap-link format used by Telegram alerts.
- Admin-gated Set Alerts rule storage for selected pairs, including amount,
  target rate, slippage tolerance, and recipient address. These alerts always
  bring the user back to review and approve in their wallet.
- Separate Limit Orders page for supported EVM contract-token pairs. The
  frontend builds a provider-verifiable order, the user signs exact terms in
  their wallet, and the backend validates the payload against the authenticated
  wallet before submitting it through the configured CoW Protocol or 1inch
  adapter. Submitted orders are reconciled with provider state and can be
  cancelled through an immediate local action, a CoW wallet signature, or a
  1inch on-chain cancellation transaction as appropriate.

Not implemented yet:

- General price alert workflows beyond favorite-pair target rates and
  reverse-swap profit/loss alerts.
- In-app notification inbox.
- Guarded import-by-address flow and token risk signals.
- Native BTC sell execution and cross-chain destination status tracking.
- Native asset, native BTC, cross-chain, and non-EVM automatic limit-order
  execution. These stay blocked until each path has a provider-verifiable
  signed-intent adapter.

## Architecture

The repository keeps quote execution and persisted user data separate:

- `src/`: Next.js frontend and quote route.
- `src/lib/server/`: server-only swap provider clients, quote normalization,
  fee configuration, rate limiting, and quote cache.
- `backend/`: Spring Boot API for wallet-authenticated history, alert delivery,
  favorite pairs, and signed limit-order submission/reconciliation.
- `backend/src/main/resources/db/migration/`: Flyway database migrations.
- `docker-compose.yml`: local PostgreSQL and optional full local stack.
- `docker-compose.prod.yml`, `infra/`, and `scripts/`: OCI-oriented production
  shape and local/deployment scripts.

High-level flow:

1. User connects a source wallet through AppKit.
2. Frontend requests quotes from the Next.js quote route with the selected
   pair, source-wallet address, and the selected receive wallet/address.
3. The quote route asks the confirmed-fee 0x adapter for same-chain routes or
   LI.FI for native-BTC paths, then returns normalized quote data.
4. The frontend checks approvals when needed and asks the user's wallet to sign
   and submit the selected transaction.
5. Swap history uses a signed wallet message to create a backend session before
   PostgreSQL history is saved or read.
6. The backend scheduler batches token USD prices, evaluates eligible historical
   swaps and favorite pairs for alert opportunities, and sends enabled
   email/Telegram/browser alerts after cooldown checks.
7. Set Alerts rules are hidden behind a backend feature switch. Saving a rule
   stores the exact threshold/slippage preference for a later notification with
   a prefilled swap link, without giving the backend private keys.
8. Limit Orders use a provider-verifiable signed-order path. For supported EVM
   contract-token pairs, the wallet signs the exact order terms and the backend
   submits only the signed payload whose maker, assets, amounts, recipient, and
   chain match the authenticated request. A leased reconciliation worker tracks
   provider state without double-processing across replicas. Cancellation is
   ownership-scoped and remains pending in the UI until the provider confirms
   whether cancellation or an in-flight fill won the race.

Native BTC swaps use the same form model: the source wallet pays, the receive
wallet/address receives, and the connected destination wallet pre-fills the
receive field when it matches the destination network. BTC-source quotes are
kept visible while Bitcoin-side PSBT signing and submission remain a dedicated
follow-up.

## Local Setup

Use the Windows-first workflow in
[docs/local-and-deployment.md](docs/local-and-deployment.md). The short path is:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-dev.ps1'
```

This starts the local database, Spring Boot backend, and Next.js frontend. It
also installs project dependencies when needed. Dependency checks fingerprint
`package.json`, `package-lock.json`, `.npmrc`, backend `pom.xml` files, and
`.mvn` config so newly added project dependencies are picked up without running
a full install every time. The scripts require Node.js 22-24, select Java 17,
keep this machine's dependency caches on `E:\`, and stop only verified
project-owned processes.

For manual debugging, the individual component scripts are still available:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\dev-db.ps1'
```

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\backend-dev.ps1'
```

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\frontend-dev.ps1'
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Spring Boot health: `http://localhost:8080/api/health`
- PostgreSQL: `localhost:56434`

## Configuration

Start from [.env.example](.env.example) for frontend/quote-route and local
backend variables. Active production environment setup is documented in
[docs/ci-cd.md](docs/ci-cd.md); the legacy all-in-one Compose path uses
[infra/prod.env.example](infra/prod.env.example).

Important quote and wallet variables:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_ALLOWED_CHAIN_IDS`
- `NEXT_PUBLIC_DISALLOW_MAINNET`
- `SWAP_PROVIDERS`
- `MONETIZED_SWAP_PROVIDERS`
- `ZEROX_API_KEY`
- `LIFI_BASE_URL`, `LIFI_API_KEY`, `LIFI_INTEGRATOR`

Production builds validate `SWAP_PROVIDERS` before deployment. Only providers
whose fee terms are confirmed in `config/provider-commercial-policy.json` can
be routed, each must have its required credentials, LI.FI must have its
registered integrator identifier, and at least one same-chain provider must
remain enabled. `MONETIZED_SWAP_PROVIDERS` must include every routed provider,
and production requires a non-zero platform fee. Dormant 1inch, ParaSwap, and
Odos settings remain available for adapter testing but are not production
quote sources.

Important fee variables:

- `FEE_RECIPIENT_ADDRESS`
- `AFFILIATE_ADDRESS`
- `PLATFORM_FEE_BPS`
- `PARASWAP_PARTNER`

Important backend variables:

- `NEXT_PUBLIC_BACKEND_BASE_URL`
- `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `CORS_ALLOW_ORIGINS`, `CORS_ALLOWED_ORIGINS`, `REQUIRE_ALLOWED_ORIGIN`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`
- either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` or
  Vercel's `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- `RATE_LIMIT_REDIS_PREFIX`, `RATE_LIMIT_REDIS_FAIL_OPEN`,
  `RATE_LIMIT_REDIS_REQUIRED`, `RATE_LIMIT_KEY_PEPPER`
- `API_TRUST_FORWARDED_HEADERS`, `API_TRUST_PRIVATE_PROXY_HEADERS`,
  `API_TRUSTED_PROXY_CIDRS`
- `API_RATE_LIMIT_KEY_PEPPER`
- `SESSION_TTL_HOURS`, `NONCE_TTL_MINUTES`, `AUTH_SESSION_COOKIE_SAME_SITE`,
  `AUTH_SESSION_COOKIE_PATH`, `AUTH_SESSION_COOKIE_SECURE`, `AUTH_EXPOSE_ACCESS_TOKEN`
- `PRICE_ALERTS_DEFAULT_ENABLED`,
  `LIMIT_ORDERS_DEFAULT_ENABLED`, `ADMIN_API_KEY`
- `LIMIT_ORDER_ORDERBOOK_SUBMISSION_ENABLED`, `ONEINCH_ORDERBOOK_BASE_URL`,
  `COW_ORDERBOOK_BASE_URL`, `COW_PARTNER_ORDERBOOK_BASE_URL`,
  `LIMIT_ORDER_REQUEST_TIMEOUT_SECONDS`
- `LIMIT_ORDER_SUBMISSION_*` controls durable submission retries;
  `LIMIT_ORDER_STATUS_CHECK_*` controls bounded provider lifecycle reconciliation
- `MAINTENANCE_CLEANUP_FIXED_DELAY_MS`, `DRY_RUN_HISTORY_RETENTION_DAYS`,
  `ALERT_RETENTION_DAYS`, `NOTIFICATION_OUTBOX_RETENTION_DAYS`
- `NOTIFICATIONS_MONITOR_ENABLED`, `NOTIFICATIONS_MONITOR_FIXED_DELAY_MS`
- `NOTIFICATIONS_DEFAULT_PROFIT_THRESHOLD_BPS`,
  `NOTIFICATIONS_DEFAULT_LOSS_THRESHOLD_BPS`,
  `NOTIFICATIONS_DEFAULT_COOLDOWN_MINUTES`
- `COINGECKO_BASE_URL`, `COINGECKO_API_KEY`, `COINGECKO_API_KEY_HEADER`,
  `COINGECKO_REQUEST_TIMEOUT_SECONDS`, `COINGECKO_CONTRACT_BATCH_SIZE`,
  `COINGECKO_MAX_ATTEMPTS`, `COINGECKO_RETRY_DELAY_MS`
- `EMAIL_NOTIFICATIONS_ENABLED`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`
- `TELEGRAM_NOTIFICATIONS_ENABLED`, `TELEGRAM_BOT_TOKEN`
- `PUSH_NOTIFICATIONS_ENABLED`, `PUSH_VAPID_PUBLIC_KEY`,
  `PUSH_VAPID_PRIVATE_KEY`, `PUSH_VAPID_SUBJECT`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

Generate VAPID keys for browser push notifications with:

```powershell
npm.cmd run generate:vapid
```

Set the same generated public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and
`PUSH_VAPID_PUBLIC_KEY`. Keep `PUSH_VAPID_PRIVATE_KEY` server-side only.

Do not commit real provider keys, production database passwords, or a live fee
recipient secret bundle. Public `NEXT_PUBLIC_*` values are shipped to the
browser by design.

Production wallet sign-in uses a Secure, HttpOnly first-party cookie through
the frontend `/backend` proxy. JavaScript stores only non-secret tab metadata;
it cannot read the production session credential.

## Verification

Run the combined local verification script:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify.ps1'
```

Or run the frontend checks directly:

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

## Deployment Shape

The current deployment target is split by responsibility:

- Vercel runs the Next.js frontend and its server-side quote route.
- OCI runs the Spring Boot backend, private PostgreSQL database, and Caddy HTTPS
  proxy.

The frontend quote route keeps provider keys server-side in Vercel. Browser
backend calls use the same-origin `/backend` proxy and a Secure, HttpOnly
session cookie; Spring Boot remains on OCI behind Caddy. See
[docs/ci-cd.md](docs/ci-cd.md)
for GitHub Actions, Vercel, OCI, and secret setup. See
[docs/earning-setup-finalization.md](docs/earning-setup-finalization.md) for
the fee-recipient, provider monetization, and launch revenue checklist. The
counsel handoff and unresolved regulatory launch gates are recorded in
[docs/legal/production-legal-review.md](docs/legal/production-legal-review.md).

## Prompt Trail

The `docs/prompt*_f.md` files preserve the AI pair-programming task sequence:

- Prompts 1-4: initial non-custodial swap MVP, wallet choice, safe quote
  testing, and quote-form guardrails.
- Prompts 5-9: Spring Boot/PostgreSQL history, wallet sign-in, honest trade
  summaries, multi-provider quotes, and monetization configuration.
- Prompts 10-19: token/network ergonomics, native BTC quote paths, source and
  recipient wallet modeling, and generic recipient-address handling.
- Prompts 20-27: wallet labels, Telegram settings/linking, favorite pairs,
  target ladders, and alert delivery fixes.
- Prompts 28-32: admin-gated Set Alerts preferences, clearer signing/approval
  guidance, Telegram deep links, and mobile quote/wallet-return UX.
- Prompts 33-38: operations diagnostics, additional EVM networks, loss
  protection alerts, trade risk cues, actionable favorite-pair links, PWA
  installability, browser push alerts, onboarding, mobile polish, and CI/CD
  deployment gate hardening.
- Prompts 39-41: production-grade Limit Orders with protocol-verifiable signed
  terms, CoW/1inch adapters, live rate samples, recipient-wallet handling, and
  user-selectable explanation levels.
