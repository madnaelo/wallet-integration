# CI/CD

This project uses a split production deployment:

- Vercel runs the Next.js frontend and its `/api/quote` route.
- OCI runs the Spring Boot backend, PostgreSQL, and Caddy HTTPS proxy.

The workflows are in `.github/workflows`.

## Workflows

- `CI`: tests, audits, typechecks, lints, and builds the frontend; tests the
  backend; applies every Flyway migration to PostgreSQL 17; starts the packaged
  backend and checks its database-backed health endpoint; and validates all
  Compose files.
- `Security`: runs dependency review, CodeQL, Gitleaks, and Trivy filesystem
  vulnerability scans.
- `Release Production`: starts only after CI succeeds for `master`/`main`,
  then waits for Security to pass for that exact commit. It publishes one
  immutable GHCR image, promotes the backend on OCI with automatic rollback,
  deploys the same commit through the Vercel CLI to the configured project, and
  verifies that both public health endpoints serve the selected commit.
  `workflow_dispatch` can release or roll back to a full commit SHA that
  belongs to `master`/`main` and has passing CI/Security runs.
- `Monitor Production`: checks the frontend, backend health, and optional
  admin operations summary every 15 minutes. It also ensures frontend and
  backend serve the same commit and can send a Telegram alert on failure.

`vercel.json` disables direct Vercel Git auto-deploys so the GitHub Actions
workflow is the single production deployment trigger.

Third-party workflow actions are pinned to immutable commit SHAs. Dependabot
tracks GitHub Action, npm, Maven, and Docker updates.

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
ONEINCH_API_KEY
```

Optional backend deployment secrets:

```text
OCI_SSH_PORT
OCI_DEPLOY_PATH
```

`OCI_CONTAINER_NETWORK` remains a temporary compatibility alias for
`OCI_PROXY_NETWORK`; new configuration should use `OCI_PROXY_NETWORK`.

Required non-secret GitHub Environment variables:

```text
OCI_PROXY_NETWORK
OCI_CADDYFILE_PATH
OCI_CADDY_CONTAINER
```

Optional non-secret GitHub Environment variables:

```text
OCI_INTERNAL_NETWORK
OCI_CONTAINER_ENGINE
```

Production monitor variables:

```text
PRODUCTION_FRONTEND_URL
PRODUCTION_FRONTEND_HEALTH_URL
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

The Vercel CLI version is pinned and verified inside
`scripts/deploy/deploy-vercel-frontend.sh`; changing it requires a reviewed code change.

`GHCR_READ_TOKEN` is optional. By default the backend workflow passes the
ephemeral `GITHUB_TOKEN` to the OCI deploy script for pulling the image it just
published to GHCR. Add `GHCR_READ_TOKEN` only if the package permission model
requires a separate read token. The token is streamed over SSH stdin, read from
a mode-600 temporary file, and deleted immediately after registry login; it is
never placed in the remote command line.

`OCI_BACKEND_ENV` is the full contents of `infra/oci-backend.env.example` with
real production values. Keep `APP_ENVIRONMENT=production`,
`API_RATE_LIMIT_KEY_PEPPER` and `ADMIN_API_KEY` as independent long
random secrets, `AUTH_SESSION_COOKIE_SECURE=true`,
`AUTH_SESSION_COOKIE_SAME_SITE=Lax`, and
`AUTH_EXPOSE_ACCESS_TOKEN=false`. The frontend proxies backend calls through
`/backend`, so the browser uses a Secure, HttpOnly first-party cookie.
For push notifications, set
`PUSH_NOTIFICATIONS_ENABLED=true`, `PUSH_VAPID_PUBLIC_KEY`,
`PUSH_VAPID_PRIVATE_KEY`, and `PUSH_VAPID_SUBJECT`. For Limit Orders, also set
`LIMIT_ORDERS_DEFAULT_ENABLED=true`, `ONEINCH_ORDERBOOK_BASE_URL`, and
`LIMIT_ORDER_ORDERBOOK_SUBMISSION_ENABLED=true` in the backend environment. Do
not commit the real file.

`OCI_SSH_KNOWN_HOSTS` must contain the OCI host key line for
`OCI_SSH_HOST`/`OCI_SSH_PORT`. Generate it once from a trusted machine with
`ssh-keyscan -p 22 <oci-host>` and verify the fingerprint in the OCI console
before saving it as a GitHub secret.

Set `ENABLE_POSTGRES_BACKUP_TIMER=true` inside `OCI_BACKEND_ENV`. The backend
deploy workflow uploads the backup script and systemd timer assets, and the
deploy script enables `wallet-postgres-backup.timer`. Each custom-format dump is
validated with `pg_restore`, checksummed, and pruned locally according to
`BACKUP_RETENTION_DAYS`. Local VM backups are not disaster recovery: configure
`OCI_BACKUP_BUCKET` and an OCI instance-principal policy so each dump and its
checksum are also uploaded to Object Storage. Configure remote retention with an
Object Storage lifecycle rule.

For the current OCI VM, these values match the manual deployment:

```text
OCI_SSH_HOST=84.235.254.97
OCI_SSH_USER=opc
OCI_DEPLOY_PATH=/home/opc/wallet
OCI_PROXY_NETWORK=uk-property-check
OCI_INTERNAL_NETWORK=wallet-internal
OCI_CADDYFILE_PATH=/home/opc/uk-property-check-middleware/Caddyfile
OCI_CADDY_CONTAINER=uk-property-check-caddy
WALLET_API_DOMAIN=wallet-api.84-235-254-97.sslip.io
```

The proxy network, Caddy process, and site block are shared infrastructure and
must already exist. The deploy script validates but never edits them. PostgreSQL is attached
only to the dedicated internal `wallet-internal` network; the backend joins both
that private network and the proxy network. No other application receives the
Swap Assistant backend environment or database network.

## Vercel Environment

Set these in the Vercel project for Production:

```text
NEXT_PUBLIC_BACKEND_BASE_URL=/backend
BACKEND_PROXY_TARGET=https://wallet-api.84-235-254-97.sslip.io
NEXT_PUBLIC_SITE_URL=https://wallet-integration-theta.vercel.app
# NEXT_PUBLIC_APP_VERSION and NEXT_PUBLIC_COMMIT_TIMESTAMP are injected by the release workflow.
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
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
RATE_LIMIT_REDIS_PREFIX=swap-assistant-prod
RATE_LIMIT_REDIS_FAIL_OPEN=false
RATE_LIMIT_REDIS_REQUIRED=true
RATE_LIMIT_KEY_PEPPER=<independent random secret of at least 32 characters>
QUOTE_CACHE_TTL_MS=8000
QUOTE_CACHE_MAX_ENTRIES=2000
```

The provider keys stay server-side in Vercel because they are used by the
Next.js route handler, not by browser code. `NEXT_PUBLIC_*` values are public by
design. Production builds fail if the backend proxy, distributed limiter,
explicit HTTPS origins, fee recipient, or anti-abuse secrets are missing or
still contain example placeholders.

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

Use these only for an emergency release. The production workflow is the normal
path because it gates and verifies one exact commit across both services.

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
export GIT_COMMIT=<full-40-character-commit>
export APP_VERSION=sha-$GIT_COMMIT
export BACKEND_IMAGE=ghcr.io/<owner>/wallet-backend:sha-$GIT_COMMIT
export GHCR_USERNAME=<github-user>
read -rsp "GHCR read token: " GHCR_TOKEN
printf '%s' "$GHCR_TOKEN" > "$HOME/.ghcr-read-token"
unset GHCR_TOKEN
chmod 600 "$HOME/.ghcr-read-token"
export GHCR_TOKEN_FILE="$HOME/.ghcr-read-token"
export WALLET_API_DOMAIN=wallet-api.84-235-254-97.sslip.io
export OCI_PROXY_NETWORK=<existing-caddy-network>
export OCI_CADDYFILE_PATH=<host-path-to-caddyfile>
export OCI_CADDY_CONTAINER=<existing-caddy-container>
./scripts/deploy/deploy-oci-backend.sh
rm -f "$HOME/.ghcr-read-token"
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
