# CI/CD

This project uses a split production deployment:

- Vercel runs the Next.js frontend and its `/api/quote` route.
- OCI runs the Spring Boot backend, PostgreSQL, and Caddy HTTPS proxy.

The workflows are in `.github/workflows`.

## Workflows

- `CI`: runs on pull requests and pushes to `master`/`main`.
  - `npm ci`
  - `npm audit --audit-level=moderate`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - `mvn clean test`
  - Docker Compose config validation
- `Security`: runs dependency review on pull requests, CodeQL for frontend and
  backend code, and Gitleaks secret scanning.
- `Deploy Frontend - Vercel`: validates the frontend, pulls production Vercel
  environment, builds through Vercel CLI, and deploys the validated prebuilt
  artifact after every push to `master`/`main`, or manually through
  `workflow_dispatch`. A Vercel deploy hook is still supported by the local
  script as a fallback, but CI expects the CLI secrets below.
- `Deploy Backend - OCI`: builds the Spring Boot backend image, pushes it to
  GHCR, then deploys it to the OCI VM after every push to `master`/`main`, or
  manually through `workflow_dispatch`. It is designed for the current
  side-by-side OCI VM where another app already owns ports 80/443 through Caddy.
- `Monitor Production`: checks the frontend, backend health, and optional
  admin operations summary every 15 minutes. It fails the workflow and can send
  a Telegram alert when production health is not acceptable.

`vercel.json` disables direct Vercel Git auto-deploys so the GitHub Actions
workflow is the single production deployment trigger.

Use GitHub Environments for production approvals if production deployments need
manual release gates later.

## Required GitHub Secrets

Frontend deployment:

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Backend deployment:

```text
OCI_SSH_HOST
OCI_SSH_USER
OCI_SSH_PRIVATE_KEY
OCI_SSH_KNOWN_HOSTS
OCI_BACKEND_ENV
WALLET_API_DOMAIN
```

Optional backend deployment secrets:

```text
OCI_SSH_PORT
OCI_DEPLOY_PATH
OCI_CONTAINER_NETWORK
OCI_CADDYFILE_PATH
OCI_CADDY_CONTAINER
```

Production monitor variables:

```text
PRODUCTION_FRONTEND_URL
PRODUCTION_BACKEND_HEALTH_URL
PRODUCTION_ADMIN_OPS_URL
```

Production monitor secrets:

```text
PRODUCTION_ADMIN_API_KEY
PRODUCTION_MONITOR_TELEGRAM_BOT_TOKEN
PRODUCTION_MONITOR_TELEGRAM_CHAT_ID
```

The Telegram monitor secrets are optional, but recommended after the Telegram
bot token is rotated. Without them, GitHub Actions failures still show that
production is unhealthy.

`VERCEL_CLI_VERSION` is optional and defaults to the pinned version in
`scripts/deploy/deploy-vercel-frontend.sh`.

`GHCR_READ_TOKEN` is optional. By default the backend workflow passes the
ephemeral `GITHUB_TOKEN` to the OCI deploy script for pulling the image it just
published to GHCR. Add `GHCR_READ_TOKEN` only if the package permission model
requires a separate read token.

`OCI_BACKEND_ENV` is the full contents of `infra/oci-backend.env.example` with
real production values. Keep `API_RATE_LIMIT_KEY_PEPPER` as a long random
secret, keep `AUTH_SESSION_COOKIE_SECURE=true` with `SameSite=None`, and keep
`AUTH_EXPOSE_ACCESS_TOKEN=true` for the cross-origin production
frontend/backend setup. For push notifications, set
`PUSH_NOTIFICATIONS_ENABLED=true`, `PUSH_VAPID_PUBLIC_KEY`,
`PUSH_VAPID_PRIVATE_KEY`, and `PUSH_VAPID_SUBJECT`. Do not commit the real file.

`OCI_SSH_KNOWN_HOSTS` must contain the OCI host key line for
`OCI_SSH_HOST`/`OCI_SSH_PORT`. Generate it once from a trusted machine with
`ssh-keyscan -p 22 <oci-host>` and verify the fingerprint in the OCI console
before saving it as a GitHub secret.

Set `ENABLE_POSTGRES_BACKUP_TIMER=true` inside `OCI_BACKEND_ENV` after the OCI
VM has enough disk space for retention. The backend deploy workflow uploads the
backup script and systemd timer assets, and the deploy script enables
`wallet-postgres-backup.timer` when that flag is true. Backups are written to
`BACKUP_DIR` as custom-format `pg_dump` files and old backups are pruned by
`BACKUP_RETENTION_DAYS`.

For the current OCI VM, these values match the manual deployment:

```text
OCI_SSH_HOST=84.235.254.97
OCI_SSH_USER=opc
OCI_DEPLOY_PATH=/home/opc/wallet
OCI_CONTAINER_NETWORK=uk-property-check
OCI_CADDYFILE_PATH=/home/opc/uk-property-check-middleware/Caddyfile
OCI_CADDY_CONTAINER=uk-property-check-caddy
WALLET_API_DOMAIN=wallet-api.84-235-254-97.sslip.io
```

## Vercel Environment

Set these in the Vercel project for Production:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=https://wallet-api.84-235-254-97.sslip.io
NEXT_PUBLIC_SITE_URL=https://wallet-integration-theta.vercel.app
NEXT_PUBLIC_APP_VERSION=<set automatically to GitHub SHA by CI>
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
NEXT_PUBLIC_ALLOWED_CHAIN_IDS=1,42161,10,8453,137,56,43114
NEXT_PUBLIC_DISALLOW_MAINNET=false

ZEROX_API_KEY=...
ONEINCH_API_KEY=...
PARASWAP_BASE_URL=https://api.paraswap.io
PARASWAP_API_KEY=
PARASWAP_API_KEY_HEADER=X-API-Key
PARASWAP_PARTNER=swapassistant
ODOS_BASE_URL=https://api.odos.xyz
ODOS_API_KEY=...
LIFI_BASE_URL=https://li.quest
LIFI_API_KEY=...
LIFI_INTEGRATOR=...
SWAP_PROVIDERS=0x,1inch,paraswap,odos,lifi

AFFILIATE_ADDRESS=...
FEE_RECIPIENT_ADDRESS=...
PLATFORM_FEE_BPS=20
CORS_ALLOW_ORIGINS=https://wallet-integration-theta.vercel.app
REQUIRE_ALLOWED_ORIGIN=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RATE_LIMIT_REDIS_PREFIX=wallet-prod
RATE_LIMIT_REDIS_FAIL_OPEN=false
QUOTE_CACHE_TTL_MS=8000
QUOTE_CACHE_MAX_ENTRIES=2000
```

The provider keys stay server-side in Vercel because they are used by the
Next.js route handler, not by browser code. `NEXT_PUBLIC_*` values are public by
design.

## OCI VM Requirements

Required on the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
```

Log out and back in so the Docker group applies. The deploy user must be able
to run `docker compose` without `sudo`.

Open ports `80` and `443` in the OCI security list/network security group.
The current backend API uses `wallet-api.84-235-254-97.sslip.io`; attach a
custom API domain later by pointing it at the OCI VM public IP and updating
`WALLET_API_DOMAIN`, Caddy, CORS, and Vercel environment values together.

## Manual Deploy Commands

Frontend from a configured workstation:

```bash
export VERCEL_TOKEN=...
export VERCEL_ORG_ID=...
export VERCEL_PROJECT_ID=...
./scripts/deploy/deploy-vercel-frontend.sh
```

Backend from the OCI VM:

```bash
cd /home/opc/wallet
export BACKEND_IMAGE=ghcr.io/<owner>/wallet-backend:<tag>
export GHCR_USERNAME=<github-user>
export GHCR_TOKEN=<read-packages-token>
export WALLET_API_DOMAIN=wallet-api.84-235-254-97.sslip.io
./scripts/deploy/deploy-oci-backend.sh
```

## Operations Checks

Public backend health:

```bash
curl -fsS https://wallet-api.84-235-254-97.sslip.io/api/health
```

Production monitor locally:

```bash
FRONTEND_URL=https://wallet-integration-theta.vercel.app \
BACKEND_HEALTH_URL=https://wallet-api.84-235-254-97.sslip.io/api/health \
./scripts/ops/check-production-health.sh
```

Admin-only backend operations summary:

```bash
curl -fsS \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  https://wallet-api.84-235-254-97.sslip.io/api/admin/ops/summary
```

The operations summary reports in-memory monitor and notification-delivery
counters since the backend process started. It is intentionally protected by the
same admin key used for feature switches.

Manual PostgreSQL backup on the OCI VM:

```bash
cd /home/opc/wallet
./scripts/deploy/backup-oci-postgres.sh
```
