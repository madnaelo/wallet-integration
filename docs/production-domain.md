# Production Domain

Canonical frontend: https://getswapradar.xyz. This is the existing Swap Assistant
Vercel project `wallet-integration`, not a new product or deployment.
Backend remains https://wallet-api.84-235-254-97.sslip.io; browsers use `/backend`.

## DNS And Redirects

Spaceship DNS, configured September 24, 2026 using Vercel's project-specific records:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | @ | 216.198.79.1 | 30 minutes |
| CNAME | www | 7d0780bed42b195f.vercel-dns-017.com. | 30 minutes |

Nameservers remain `launch1.spaceship.net` and `launch2.spaceship.net`.
There were no prior host records to delete. No unrelated domain or mail records changed.
Vercel manages HTTPS certificates. `www` uses a 308 redirect to the apex.
Re-read Vercel's recommended records before any future DNS replacement.

The old `wallet-integration-theta.vercel.app` alias remains operational for old
links, origin-scoped sessions, and existing integrations. Its metadata declares
the new canonical domain. Deployment-specific `.vercel.app` URLs and protected
staging checks are not redirected. No shared backend ingress/domain was changed.

## Configuration

- Vercel production `NEXT_PUBLIC_SITE_URL=https://getswapradar.xyz`.
- Vercel `CORS_ALLOW_ORIGINS` permits only the new apex and old production alias.
- GitHub `PRODUCTION_FRONTEND_URL` and `PRODUCTION_FRONTEND_HEALTH_URL` point to
  the apex and its `/api/health`; controlled releases and monitoring use them.
- The release overlays the validated canonical domain into backend `APP_URL`,
  `FRONTEND_URL`, `AUTH_SIGNING_DOMAIN`, `AUTH_SIGNING_URI` and explicit origin
  allowlists. Old secret-bundle URLs cannot silently undo this migration.
- Signing messages and new notification links use the new domain. Existing
  cookies, installed PWAs, local preferences and push permissions are scoped to
  their original origin; users may need to sign in/enable push on the new domain.
- Never print or commit secrets when synchronizing ignored local production env files.

## Search And Safety

One shared site URL supplies metadataBase, JSON-LD, sitemap and robots sitemap.
Public home, business and Market Radar retain their indexable metadata.
Admin pages remain noindex and server-authenticated; `/demo` stays synthetic,
noindex and `connect-src 'none'`. API/backend paths are excluded from indexing.
The private research/commercial Radar policies, fee policy, contact delivery,
provider credentials and backend API address are unchanged.

## Verification

Run `npm run test:preflight`, unit tests and the full CI/security pipelines.
After controlled promotion, run browser tests with
`PLAYWRIGHT_TEST_BASE_URL=https://getswapradar.xyz` and
`PLAYWRIGHT_EXPECTED_SITE_URL=https://getswapradar.xyz`.
Verify exact frontend/backend commits, DNS, valid HTTPS, `www` path/query redirects,
contact submission/delivery, canonical/social/structured metadata and crawl
boundaries. Check unauthorized private API denial and public live Radar gates.
Do not connect a real wallet or submit a real transaction for this migration.
