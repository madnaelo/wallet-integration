# Context Handoff

Use this file first when restarting in a fresh context.

## Project And Account Boundary

- This repository is a personal project. Work only from
  `E:\assignments\wallet`; `F:` is reserved for office work.
- Use the personal GitHub account `madnaelo` (`madnaelo@yahoo.com`) for this
  repository. Do not use the `aqeel-datacell` account.
- Existing signed-in browser and connected-email sessions may be used for
  project authentication when the user has authorized the account action.
- Never write passwords, one-time authorization codes, API tokens, wallet
  private keys, or seed phrases into the repository or handoff documents.

## Read Order

1. `README.md`
2. `docs/BRD.md`
3. `docs/local-and-deployment.md`
4. `docs/ci-cd.md`
5. `docs/earning-setup-finalization.md`
6. Known issue notes in `docs/known-issues/` when relevant
7. Recent `docs/prompt*_f.md` files relevant to the task
8. Current git status/diff

The prompt files are the detailed AI pair-programming trail. The README and
BRD are the current product/architecture summary.

## Current Product Direction

Swap Assistant is a non-custodial swap assistant:

- compare quotes across configured providers,
- let the user's wallet execute swaps,
- persist wallet-owned history,
- save favorite pairs and target alerts,
- detect reverse-swap profit and loss-protection opportunities,
- notify users through configured channels,
- store Set Alerts preferences only when the admin feature switch allows it.

The backend still does not custody funds or private keys. Set Alerts storage is
preference/rule storage, not autonomous private-key signing.

## Current Implementation

- Frontend: Next.js App Router.
- Quote route: confirmed-fee production routing through 0x and LI.FI. Dormant
  1inch, ParaSwap/Velora, and Odos adapters fail closed until commercial terms
  are explicitly confirmed.
- Wallet connection: Reown AppKit plus provider-specific signing handling.
- Backend: Spring Boot, Flyway, PostgreSQL.
- Notifications: scheduled monitor with email, Telegram, and browser push
  adapters.
- Browser push notifications are implemented, but a mobile subscription issue
  is paused and documented in
  `docs/known-issues/mobile-push-subscription.md`.
- Set Alerts is alert-to-confirm only. Separately, Limit Orders can submit exact
  provider-verifiable signed orders for supported EVM pairs; unsupported pairs
  remain alert-only. See
  `docs/architecture-decisions/price-alerts-and-limit-orders.md`.
- Operations: health endpoint plus admin operations summary for monitor and
  notification counters.
- Deployment: Vercel for frontend/quote route, OCI for backend/PostgreSQL/Caddy.
- CI/CD: GitHub Actions deploys both frontend and backend on pushes to
  `master`.

## Local Workflow

Start the local stack:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-dev.ps1'
```

Stop it:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\stop-dev.ps1'
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/api/health`
- PostgreSQL: `localhost:56434`

## Verification Habit

Run before committing meaningful code changes:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify.ps1'
```

For documentation-only changes, `git diff --check` is usually enough.

## Restart Prompt

```text
We are continuing work on Swap Assistant in E:\assignments\wallet.
Please first read README.md, docs/BRD.md, docs/context-handoff.md, and any
prompt files relevant to the task. Then inspect git status/diff before making
changes.
```
