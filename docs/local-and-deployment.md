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
- starts the Spring Boot backend in the background, loading `.env.development`
  for local-only backend secrets when present,
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
  `localhost:55434`.

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
- Postgres: `localhost:55434`, database/user/password all `wallet`

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

## Production Shape

The active production target is split: Vercel runs the frontend/quote route,
and OCI runs PostgreSQL, the Spring Boot backend, and Caddy for the backend API
domain. See [CI/CD](ci-cd.md) for GitHub Actions deployment, required secrets,
and production setup.

The older all-in-one OCI Compose shape is still available for a single-VM
deployment, but it is not the current production path.

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
