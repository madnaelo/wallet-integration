# The Wallet

The Wallet is a non-custodial personal swap aggregator. It connects a user's
wallet, compares quotes from configured swap providers, lets the wallet execute
the selected swap, and stores wallet-owned swap history for the product path
toward favorite pairs, reverse-swap profit checks, and notifications.

The application never stores private keys, never takes custody of funds, and the
backend never signs swap transactions.

## Current MVP

Implemented:

- Next.js App Router frontend with ethers-based wallet transaction execution.
- Reown AppKit wallet connection for installed wallets and WalletConnect-style
  QR/mobile flows.
- Same-chain swap selection for configured Ethereum, Polygon, and Base
  networks. The connected wallet chain is selected when it is allowed.
- Searchable token pickers backed by cached token-list/provider metadata,
  native/popular-token fallbacks, native BTC receive selection, and a sell/buy
  reversal control.
- `GET /api/quote` with validation, per-IP rate limiting, and short quote cache.
- Multi-provider same-chain quote clients for 0x, 1inch, ParaSwap, and Odos.
  LI.FI builds EVM-to-native-BTC receive quotes. Successful quotes are
  normalized and shown through one provider/route UI.
- Provider failure isolation: one timed-out or rejected provider does not hide
  successful quotes from other configured providers.
- User-facing trade summary with slippage, quote expiry, provider selection,
  receive/minimum-received amounts, service fees, and network cost.
- Dry-run guardrails for real quote testing without accidental live swaps.
- Spring Boot and PostgreSQL backend for signed wallet sessions and swap
  history.
- Collapsed swap history panel that loads authenticated history on demand and
  stores dry-run, submitted cross-chain, or confirmed swaps.

Not implemented yet:

- Favorite token pairs.
- Scheduled reverse-swap profit scanning.
- Price alert thresholds.
- Email, Telegram, push, or in-app notification delivery.
- Guarded import-by-address flow and token risk signals.
- Native BTC sell execution and cross-chain destination status tracking.

## Architecture

The repository keeps quote execution and persisted user data separate:

- `src/`: Next.js frontend and quote route.
- `src/lib/server/`: server-only swap provider clients, quote normalization,
  fee configuration, rate limiting, and quote cache.
- `backend/`: Spring Boot API for wallet-authenticated history.
- `backend/src/main/resources/db/migration/`: Flyway database migrations.
- `docker-compose.yml`: local PostgreSQL and optional full local stack.
- `docker-compose.prod.yml`, `infra/`, and `scripts/`: OCI-oriented production
  shape and local/deployment scripts.

High-level flow:

1. User connects a wallet through AppKit.
2. Frontend requests quotes from the Next.js quote route with the selected
   pair, wallet taker address, and a Bitcoin receive address only when native
   BTC is the output.
3. The quote route asks enabled same-chain providers in parallel or LI.FI for
   an EVM-to-BTC quote, then returns normalized executable quote data.
4. The frontend checks approvals when needed and asks the user's wallet to sign
   and submit the selected transaction.
5. Swap history uses a signed wallet message to create a backend session before
   PostgreSQL history is saved or read.

## Local Setup

Use the Windows-first workflow in
[docs/local-and-deployment.md](docs/local-and-deployment.md). The short path is:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\dev-db.ps1'
```

Start the backend in a second PowerShell terminal:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\backend-dev.ps1'
```

Start the frontend in a third PowerShell terminal:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\frontend-dev.ps1'
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Spring Boot health: `http://localhost:8080/api/health`
- PostgreSQL: `localhost:55432`

## Configuration

Start from [.env.example](.env.example) for frontend/quote-route and local
backend variables. Production Compose uses
[infra/prod.env.example](infra/prod.env.example) as its secret template.

Important quote and wallet variables:

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- `NEXT_PUBLIC_ALLOWED_CHAIN_IDS`
- `NEXT_PUBLIC_DISALLOW_MAINNET`
- `SWAP_PROVIDERS`
- `ZEROX_API_KEY`
- `ONEINCH_API_KEY`
- `PARASWAP_BASE_URL`, `PARASWAP_API_KEY`, `PARASWAP_API_KEY_HEADER`
- `ODOS_BASE_URL`, `ODOS_API_KEY`
- `LIFI_BASE_URL`, `LIFI_API_KEY`, `LIFI_INTEGRATOR`

Important fee variables:

- `FEE_RECIPIENT_ADDRESS`
- `AFFILIATE_ADDRESS`
- `PLATFORM_FEE_BPS`
- `PARASWAP_PARTNER`

Important backend variables:

- `NEXT_PUBLIC_BACKEND_BASE_URL`
- `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
- `CORS_ALLOW_ORIGINS`, `CORS_ALLOWED_ORIGINS`
- `SESSION_TTL_HOURS`, `NONCE_TTL_MINUTES`

Do not commit real provider keys, production database passwords, or a live fee
recipient secret bundle. Public `NEXT_PUBLIC_*` values are shipped to the
browser by design.

## Verification

Run the combined local verification script:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify.ps1'
```

Or run the frontend checks directly:

```powershell
npm run typecheck
npm run lint
```

## Deployment Shape

The current deployment plan is one OCI VM running Docker Compose:

- Caddy for HTTPS and reverse proxy.
- Next.js frontend.
- Spring Boot backend.
- Private PostgreSQL database.

The frontend quote route keeps provider keys server-side. Spring Boot serves
wallet-authenticated history behind the backend proxy route. See
[docs/local-and-deployment.md](docs/local-and-deployment.md) for the deployment
commands and production env preparation.

## Prompt Trail

The `docs/prompt*_f.md` files preserve the AI pair-programming task sequence:

- [Prompt 1](docs/prompt1_f.md): first non-custodial swap sketch.
- [Prompt 2](docs/prompt2_f.md): production-ready MVP requirements.
- [Prompt 3](docs/prompt3_f.md): wallet choice beyond MetaMask.
- [Prompt 4](docs/prompt4_f.md): safe quote testing and quote-form guardrails.
- [Prompt 5](docs/prompt5_f.md): Spring Boot/PostgreSQL swap history.
- [Prompt 6](docs/prompt6_f.md): multi-wallet connection and wallet sign-in
  hardening.
- [Prompt 7](docs/prompt7_f.md): honest trade summary and provider-route UX.
- [Prompt 8](docs/prompt8_f.md): multi-provider quote aggregation.
- [Prompt 9](docs/prompt9_f.md): platform fee and provider operations config.
- [Prompt 10](docs/prompt10_f.md): chain and token selector ergonomics.
- [Prompt 11](docs/prompt11_f.md): searchable same-chain tokens and simpler
  network UX.
- [Prompt 12](docs/prompt12_f.md): native BTC receive quotes without confusing
  BTC with wrapped EVM tokens.

