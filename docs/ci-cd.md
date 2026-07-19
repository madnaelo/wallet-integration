# CI/CD

This project uses a split production deployment:

- Vercel runs the Next.js frontend and its `/api/quote` route.
- OCI runs the Spring Boot backend, PostgreSQL, and Caddy HTTPS proxy.

The workflows are in `.github/workflows`.

## Workflows

- `CI`: tests, audits, typechecks, lints, and builds the frontend; tests the
  backend; applies every Flyway migration to PostgreSQL 16; starts the packaged
  backend and checks its database-backed health endpoint; and validates all
  Compose files.
- `Security`: runs dependency review, CodeQL when GitHub Advanced Security is
  available, mandatory Semgrep OSS analysis for Java and TypeScript, Gitleaks,
  and Trivy filesystem vulnerability scans.
- `Release Production`: starts only after CI succeeds for `master`,
  then waits for Security to pass for that exact commit. It publishes one
  immutable GHCR image and builds a production Vercel deployment without
  assigning the public domain. After that staged frontend passes its health
  check, the workflow promotes the backend on OCI with automatic rollback,
  promotes the already-verified Vercel deployment, and verifies that both
  public health endpoints serve the selected commit.
  Staged deployment URLs remain protected; the workflow verifies them through
  Vercel's dedicated automation-bypass header rather than weakening deployment
  protection or depending on the beta `vercel curl` wrapper.
  `workflow_dispatch` can release or roll back to a full commit SHA that
  belongs to `master` and has passing CI/Security runs.
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
VERCEL_PROTECTION_BYPASS_SECRET
```

`VERCEL_PROTECTION_BYPASS_SECRET` must match a dedicated Protection Bypass for
Automation entry on the Vercel project. It is used only to verify the protected
staged deployment before promotion; keep it encrypted in GitHub and never add it
to frontend environment variables.

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
```

`OCI_CONTAINER_NETWORK` remains a temporary compatibility alias for
`OCI_PROXY_NETWORK`; new configuration should use `OCI_PROXY_NETWORK`.

Required non-secret GitHub Environment variables:

```text
OCI_PROXY_NETWORK
OCI_CADDYFILE_PATH
OCI_CADDY_CONTAINER
OCI_BACKUP_BUCKET
OCI_BACKUP_NAMESPACE
OCI_BACKUP_OBJECT_PREFIX
```

Optional non-secret GitHub Environment variables:

```text
OCI_DATABASE_NETWORK
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
`ADMIN_API_KEY` as a long random secret, `AUTH_SESSION_COOKIE_SECURE=true`,
`AUTH_SESSION_COOKIE_SAME_SITE=Lax`, `AUTH_SESSION_COOKIE_PATH=/backend`, and
`AUTH_EXPOSE_ACCESS_TOKEN=false`. The frontend proxies backend calls through
`/backend`, so the browser uses a Secure, HttpOnly first-party cookie.
The release workflow derives `API_RATE_LIMIT_KEY_PEPPER` with HMAC-SHA256
from `ADMIN_API_KEY` and a versioned domain label. This produces a stable,
cryptographically separated backend key without storing or logging another
deploy secret.
For push notifications, set
`PUSH_NOTIFICATIONS_ENABLED=true`, `PUSH_VAPID_PUBLIC_KEY`,
`PUSH_VAPID_PRIVATE_KEY`, and `PUSH_VAPID_SUBJECT`. For Limit Orders, also set
`LIMIT_ORDERS_DEFAULT_ENABLED=true`, `ONEINCH_ORDERBOOK_ENABLED=false`, and
`LIMIT_ORDER_ORDERBOOK_SUBMISSION_ENABLED=true` in the backend environment. Do
not commit the real file. Keep 1inch disabled until the API account has written
commercial-use approval; enabling it also requires `ONEINCH_API_KEY`.

`OCI_SSH_KNOWN_HOSTS` must contain the OCI host key line for
`OCI_SSH_HOST`/`OCI_SSH_PORT`. Generate it once from a trusted machine with
`ssh-keyscan -p 22 <oci-host>` and verify the fingerprint in the OCI console
before saving it as a GitHub secret.

Production releases force `ENABLE_POSTGRES_BACKUP_TIMER=true` and overlay the
three non-secret Object Storage variables above. Before changing the live
backend, deployment runs an immediate backup and fails unless the custom-format
dump passes `pg_restore` validation, is checksummed, and uploads to Object
Storage through the VM's instance principal. It then enables and verifies
`wallet-postgres-backup.timer` and checks the new backup's age, permissions,
checksum, archive structure, and timer state. Local dumps are retained for 14
days. The private `swap-assistant-postgres-backups` bucket is isolated in the
`SwapAssistant` compartment and deletes the
`swap-assistant/postgres/` objects after 35 days through an OCI lifecycle rule.
The VM policy is append-only: it can create backup objects but cannot read,
overwrite, or delete existing backups.
When offsite backups are enabled, deployment idempotently installs Oracle's
signed OCI CLI package on supported Oracle Linux 8/9 hosts before verifying the
first upload. Unsupported host operating systems fail closed with installation
guidance instead of skipping offsite backups.

The `Verify Production Backups` workflow checks backup freshness every day and
performs a complete restore into an isolated temporary PostgreSQL database each
Sunday. It shares the production-release concurrency group, so recovery drills
cannot overlap an OCI deployment. A failed check is visible in GitHub Actions
and is also sent to the configured operator Telegram chat.

For the current OCI VM, these values match the manual deployment:

```text
OCI_SSH_HOST=84.235.254.97
OCI_SSH_USER=opc
OCI_DEPLOY_PATH=/home/opc/wallet
OCI_PROXY_NETWORK=uk-property-check
OCI_DATABASE_NETWORK=wallet-database
OCI_CADDYFILE_PATH=/home/opc/uk-property-check-middleware/Caddyfile
OCI_CADDY_CONTAINER=uk-property-check-caddy
WALLET_API_DOMAIN=wallet-api.84-235-254-97.sslip.io
```

The deploy script verifies that the configured ingress network already contains
the shared Caddy container before attaching Swap Assistant's backend. It never
creates, deletes, or reconfigures that externally managed network. If a future
single-application host uses a missing network name, the script can create an
ownership-labelled Swap Assistant proxy network instead. The Caddy process and
the explicit Swap Assistant site block remain shared edge infrastructure; the
script validates and atomically reloads the existing configuration but never
edits it.

PostgreSQL is attached only to the dedicated `wallet-database` network and
never publishes a host port; the backend joins that private network and the
existing Caddy ingress network. The shared Caddy container is not given the
database network.
Docker uses an internal database network. Podman uses a dedicated DNS-enabled
bridge because CNI-based Podman disables container name resolution on internal
networks. No other application receives the Swap Assistant backend environment
or database network, and Caddy remains single-homed on its own ingress network
so host-port routing is deterministic.

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
ONEINCH_API_KEY=
PARASWAP_BASE_URL=https://api.paraswap.io
PARASWAP_API_KEY=
PARASWAP_API_KEY_HEADER=X-API-Key
PARASWAP_PARTNER=swapassistant
ODOS_BASE_URL=https://api.odos.xyz
ODOS_API_KEY=...
LIFI_BASE_URL=https://li.quest
LIFI_API_KEY=...
LIFI_INTEGRATOR=...
SWAP_PROVIDERS=0x,paraswap,odos,lifi
MONETIZED_SWAP_PROVIDERS=0x,lifi

AFFILIATE_ADDRESS=...
FEE_RECIPIENT_ADDRESS=...
PLATFORM_FEE_BPS=20
CORS_ALLOW_ORIGINS=https://wallet-integration-theta.vercel.app
REQUIRE_ALLOWED_ORIGIN=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=30
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
RATE_LIMIT_REDIS_PREFIX=swap-assistant-prod
RATE_LIMIT_REDIS_FAIL_OPEN=false
RATE_LIMIT_REDIS_REQUIRED=true
RATE_LIMIT_KEY_PEPPER=<independent random secret of at least 32 characters>
QUOTE_CACHE_TTL_MS=8000
QUOTE_CACHE_MAX_ENTRIES=2000
```

The Vercel Upstash Marketplace integration injects `KV_REST_API_URL` and
`KV_REST_API_TOKEN`. Direct Upstash setups may instead use
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Configure one
complete pair only; the runtime deliberately refuses to combine credentials from
different pairs.

The provider keys stay server-side in Vercel because they are used by the
Next.js route handler, not by browser code. `NEXT_PUBLIC_*` values are public by
design. Production builds fail if the backend proxy, distributed limiter,
explicit HTTPS origins, fee recipient, or anti-abuse secrets are missing or
still contain example placeholders.

The production build also fails closed when an enabled provider is misspelled
or is missing its required credential. `0x`, Odos, and LI.FI therefore require
the keys shown above; LI.FI also requires its registered integrator identifier.
ParaSwap is the only enabled production provider allowed to use its public API
without a key while partner approval is pending.

Quote access and fee collection are configured separately.
`MONETIZED_SWAP_PROVIDERS` must be a subset of `SWAP_PROVIDERS`, and every item
must have `monetization: confirmed` in
`config/provider-commercial-policy.json`. A production build fails if a pending
provider is added. As of July 19, 2026, fee parameters are enabled only for 0x
and LI.FI; ParaSwap/Velora and Odos remain quote-only while written commercial
confirmation is pending, and 1inch remains disabled in production.

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

The OCI deployment script also supports Oracle Linux hosts where Docker is
provided by the Podman compatibility package. CNI-based Podman requires the
Oracle podman-plugins package for private container-name resolution. The
deployment verifies that support and installs the fixed package through
dnf/yum when it is missing; the deploy user therefore needs passwordless
sudo for the container engine and that package installation. On legacy CNI
hosts where the DNS service still fails at runtime, deployment accepts only a
validated private address that passes a same-network PostgreSQL probe and
injects it into the candidate backend without publishing the database port.

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

Validate that a selected backup can be restored without exposing a database
port or touching the live database:

```bash
sudo /usr/local/bin/swap-assistant-postgres-restore-check \
  /home/opc/wallet/backups/postgres/wallet-postgres-YYYYMMDDTHHMMSSZ.dump
```

Check freshness and integrity without performing a restore:

```bash
sudo env OCI_DEPLOY_PATH=/home/opc/wallet \
  /usr/local/bin/swap-assistant-postgres-backup-check
```

The restore verifier requires a matching checksum, restores into a temporary
isolated PostgreSQL container, checks the required schema, and removes its
container and volume on exit. GitHub runs this drill weekly; run it manually as
well after changing backup or database infrastructure.
