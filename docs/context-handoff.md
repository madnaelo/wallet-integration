# Context Handoff

Use this file first when restarting in a fresh context.

## Read Order

1. `README.md`
2. `docs/BRD.md`
3. `docs/local-and-deployment.md`
4. `docs/ci-cd.md`
5. `docs/earning-setup-finalization.md`
6. Recent `docs/prompt*_f.md` files relevant to the task
7. Current git status/diff

The prompt files are the detailed AI pair-programming trail. The README and
BRD are the current product/architecture summary.

## Current Product Direction

The Wallet is a non-custodial swap assistant:

- compare quotes across configured providers,
- let the user's wallet execute swaps,
- persist wallet-owned history,
- save favorite pairs and target alerts,
- detect reverse-swap opportunities,
- notify users through configured channels,
- store Auto Swap preferences only when the admin feature switch allows it.

The backend still does not custody funds or private keys. Auto Swap storage is
preference/rule storage, not autonomous private-key signing.

## Current Implementation

- Frontend: Next.js App Router.
- Quote route: server-side provider clients for 0x, 1inch, ParaSwap/Velora,
  Odos, and LI.FI.
- Wallet connection: Reown AppKit plus provider-specific signing handling.
- Backend: Spring Boot, Flyway, PostgreSQL.
- Notifications: scheduled monitor with email and Telegram adapters.
- Deployment: Vercel for frontend/quote route, OCI for backend/PostgreSQL/Caddy.
- CI/CD: GitHub Actions deploys both frontend and backend on pushes to
  `master`/`main`.

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
- PostgreSQL: `localhost:55434`

## Verification Habit

Run before committing meaningful code changes:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify.ps1'
```

For documentation-only changes, `git diff --check` is usually enough.

## Restart Prompt

```text
We are continuing work on The Wallet in E:\assignments\wallet.
Please first read README.md, docs/BRD.md, docs/context-handoff.md, and any
prompt files relevant to the task. Then inspect git status/diff before making
changes.
```
