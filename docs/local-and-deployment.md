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

Run this from Windows PowerShell to start the whole local stack:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-dev.ps1'
```

This script:

- installs frontend dependencies with `npm ci` when needed,
- downloads backend Maven dependencies when needed,
- starts Docker Desktop on Windows if Docker is installed but the daemon is not
  running,
- starts local Postgres through Docker Compose,
- starts the Spring Boot backend in the background,
- starts the Next.js frontend in the background,
- writes logs to `logs/dev`.

Dependency installs are not based only on whether `node_modules` exists. The
script fingerprints dependency inputs and stores markers in `.dev`:

- frontend: `package.json`, `package-lock.json`, and `.npmrc` when present,
- backend: backend `pom.xml` files and `.mvn` config when present.

If those inputs change, the script prepares dependencies again. If the inputs
did not change, it also checks the existing Node install with `npm ls` before
skipping npm work.

The script installs project dependencies only. It still expects the global
tools to exist on the machine:

- PowerShell,
- Node.js and npm,
- JDK 17 and Maven,
- Docker and Docker Compose, unless an existing Postgres is already reachable on
  `localhost:55432`.

On Windows, the script tries to start Docker Desktop when Docker is installed
but the daemon is not running. On macOS/Linux/other environments, it uses the
available Docker daemon and tells the developer to start Docker if the daemon is
not reachable.

Use `-SkipInstall` when dependencies are already installed and you only want to
start services:

```powershell
Set-Location 'E:\assignments\wallet'
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\start-dev.ps1' -SkipInstall
```

For manual debugging, each component can still be started separately. Each block
is copy-paste ready.

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
- Native BTC quote paths through LI.FI with separate source and receive wallet
  modeling in the frontend.
- Backend notification preferences, scheduled reverse-swap profit scanning, and
  email/Telegram delivery adapters.
- Favorite pairs with above/below target-rate alerts.

Not implemented yet:

- General price alerts beyond favorite-pair target rates and reverse-swap
  profit alerts.
- Push or in-app notification delivery.
- Native BTC sell execution and cross-chain destination status tracking.
