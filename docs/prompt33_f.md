# Prompt 33 - Operational Health And Diagnostics

## Product Need

The Wallet is moving toward a production MVP, so we need basic operational
visibility before more user-facing alert workflows are added.

## Prompt

Scan the current frontend and backend for reliability gaps. Add lightweight
diagnostics that help us see whether the backend database, notification monitor,
and delivery adapters are healthy. Keep sensitive data protected. Any admin
operations view must require the admin key and must not expose provider keys,
Telegram tokens, database passwords, or wallet secrets.

Also add quote-provider diagnostics so that if one swap route provider fails,
we can see which provider failed without breaking the user's quote flow.

## Implementation Guidance

- Reuse the existing Spring Boot backend and feature/admin-key style.
- Keep counters in memory for MVP; do not add a heavy metrics stack yet.
- Return degraded health when the database is unavailable.
- Preserve provider failure isolation in the quote route.
- Document how to call the health and admin operations endpoints.
- Commit this as its own clean change.
