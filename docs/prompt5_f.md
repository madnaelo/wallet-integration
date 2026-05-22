# Prompt 5: Persist Wallet-Owned Swap History

The product direction is now bigger than a single swap screen. Favorite pairs,
reverse-swap profit checks, and notifications will eventually need backend
persistence. Browser local storage alone is not enough for scheduled checks.

Start the backend persistence work with swap history only.

## Scope

Implement these two related slices:

1. A Spring Boot and PostgreSQL backend for wallet-owned swap history.
2. The frontend history flow and local/deployment setup needed to run it.

## Backend Requirements

- Use Spring Boot with PostgreSQL and migrations.
- Add health, authentication, and swap-history API routes.
- Store swap history against a wallet address.
- Do not trust a wallet address sent by the frontend as proof of ownership.
- Use wallet message signing for backend session creation:
  - issue a nonce/message,
  - verify the wallet signature,
  - create a session token with expiry,
  - store only what is needed to authenticate later history requests.
- Allow a wallet to create and read only its own history records.
- Include enough swap data for future reverse-swap analysis:
  - chain id,
  - token addresses, symbols, and decimals,
  - raw sell and buy amounts,
  - minimum buy amount when available,
  - provider/aggregator,
  - status,
  - transaction hash or dry-run marker,
  - quote snapshot when appropriate.
- Keep the backend non-custodial. It must never sign or submit swaps.

## Frontend Requirements

- Sign in to the backend through the connected wallet when history syncing is
  requested.
- Save dry-run and confirmed swap executions to the backend.
- Read history from the backend only for an authenticated wallet session.
- Show swap history as a user-facing table with headings.
- Keep the history panel collapsed by default and load history only when the
  panel is expanded.
- Prevent repeated in-flight history refresh requests from stacking up.
- Remove developer-only labels from the user portal.

## Local And Deployment Requirements

- Provide a local PostgreSQL path that works on Windows.
- Add scripts for starting Postgres, backend, frontend, verification, and local
  shutdown.
- Add Docker Compose support for local and production-shaped services.
- Document the planned deployment shape for one OCI VM with reverse proxy,
  frontend, backend, and private database containers.
- Keep secrets out of committed environment files.

## Product Boundary

Do not implement favorite pairs, scheduled price checks, reverse-swap alerts, or
notification channels in this slice. This prompt creates the persistence base
they will use later.
