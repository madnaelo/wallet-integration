# Local And Deployment Workflow

## Local Prerequisites

Already detected on this machine:

- Node.js 20
- npm 10
- Maven 3.9
- JDK 17 installed at `C:\Program Files\Java\jdk-17`
- Docker CLI and Docker Compose

Current local notes:

- Maven defaults to Java 8 in the global environment. The scripts set `JAVA_HOME` to JDK 17 for backend commands.
- `psql` is not on PATH. This is fine for the default workflow because Postgres runs through Docker.
- Docker Desktop must be running before Compose commands work.

## Local Native Workflow

Run these from Windows PowerShell. Each block is copy-paste ready.

Terminal 1: start local Postgres:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\dev-db.ps1'
```

Terminal 2: start Spring Boot backend:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\backend-dev.ps1'
```

Terminal 3: start Next.js frontend:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\frontend-dev.ps1'
```

Stop local services started by the scripts:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\stop-dev.ps1'
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/api/health`
- Postgres: `localhost:55432`, database/user/password all `wallet`

## Local Full Docker Workflow

Once Docker Desktop is running, the full stack can also be started with:

```powershell
Set-Location 'E:\assignments\wallet'
docker compose --profile full up -d --build
```

The default Compose command without the profile starts only Postgres:

```powershell
Set-Location 'E:\assignments\wallet'
docker compose up -d postgres
```

## Verification

Run:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\verify.ps1'
```

This runs:

- `npm run typecheck`
- `mvn -f backend/pom.xml test`

## Production Shape On OCI

The planned production model is one OCI VM running Docker Compose:

- `postgres`: private Postgres database
- `backend`: Spring Boot API
- `frontend`: Next.js app
- `caddy`: HTTPS and reverse proxy

Public routes:

- `https://yourdomain.com` -> frontend
- `https://yourdomain.com/api/backend/*` -> Spring Boot backend

Prepare production env:

```powershell
Set-Location 'E:\assignments\wallet'
Copy-Item '.\infra\prod.env.example' '.\infra\prod.env' -Force
notepad '.\infra\prod.env'
```

Then edit `infra/prod.env` with real production values. Do not commit that file.

Deploy/update on the OCI Linux VM after the repo is copied or pulled there:

```bash
cd /opt/wallet
chmod +x scripts/prod-deploy.sh
./scripts/prod-deploy.sh
```

## Product Scope In This Milestone

Implemented now:

- Wallet-owned backend session via signed wallet message.
- Postgres-backed swap history.
- Frontend saves dry-run, submitted cross-chain, and confirmed swaps to the
  backend.
- Frontend reads authenticated swap history from the backend.
- Native BTC receive quotes from supported EVM source assets through LI.FI.

Not implemented yet:

- Favorite pairs table.
- Alert thresholds.
- Scheduled reverse-swap scanner.
- Email, Telegram, or push notification delivery.
- Native BTC sell execution and cross-chain destination status tracking.
