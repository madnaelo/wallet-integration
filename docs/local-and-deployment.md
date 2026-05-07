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

Start local Postgres:

```powershell
.\scripts\dev-db.ps1
```

If PowerShell blocks local scripts, run them with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-db.ps1
```

Start Spring Boot backend:

```powershell
.\scripts\backend-dev.ps1
```

Start Next.js frontend:

```powershell
.\scripts\frontend-dev.ps1
```

Stop local services started by the scripts:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/api/health`
- Postgres: `localhost:55432`, database/user/password all `wallet`

## Local Full Docker Workflow

Once Docker Desktop is running, the full stack can also be started with:

```powershell
docker compose --profile full up -d --build
```

The default Compose command without the profile starts only Postgres:

```powershell
docker compose up -d postgres
```

## Verification

Run:

```powershell
.\scripts\verify.ps1
```

On this machine the verified command was:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
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

```bash
cp infra/prod.env.example infra/prod.env
```

Then edit `infra/prod.env` on the server with real values.

Deploy/update:

```bash
./scripts/prod-deploy.sh
```

## Product Scope In This Milestone

Implemented now:

- Wallet-owned backend session via signed wallet message.
- Postgres-backed swap history.
- Frontend saves dry-run and confirmed swaps to the backend.
- Frontend reads authenticated swap history from the backend.

Not implemented yet:

- Favorite pairs table.
- Alert thresholds.
- Scheduled reverse-swap scanner.
- Email, Telegram, or push notification delivery.
