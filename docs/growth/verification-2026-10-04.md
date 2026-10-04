# Organic Search Maintenance: October 4, 2026

## Scope

- Stop outbound acquisition in repository instructions and growth operations. Keep opt-in product messages and contact delivery intact.
- Add a server-rendered `/guides` collection linking the three existing substantive guides. Navigation and breadcrumb links work without JavaScript. Reuse existing content, branding and the synthetic demo image.
- Add canonical/social metadata and CollectionPage/ItemList structured data matching the visible collection. Preserve normal full-page navigation into the isolated demo.
- Allowlist `/guides` for existing privacy-conscious attribution and deployment-triggered IndexNow. Do not broaden event kinds, permissions or private-route discovery.
- Remove the global commit timestamp from sitemap `lastmod`: backend/docs releases are not evidence that every public page's significant content changed. Leave the optional element absent until reliable per-page modification dates exist.
- No new trading feature, new provider, data-rights change, migration, email send or contact-form submission.

## Search Evidence

Read-only checks in the owner's Google Search Console, with one live sitemap fetch test, are recorded in [the dated scoreboard](scoreboard.md#october-4-organic-search-only). Guides and public Radar now have individual indexed confirmations. One impression and zero clicks do not establish commercial traction. The sitemap-processing error remains unresolved despite successful direct and Google live fetches.

## Verification

Regression coverage includes guide navigation and matching structured data without JavaScript at 320/390/1440px; guide breadcrumbs; canonical/robots/private-route boundaries; sitemap stability across unrelated commit timestamps; bounded attribution in TypeScript and Java; and IndexNow's existing deployment/proof checks.

Local checks so far: 298 unit tests passed with one worker; seven database-dependent tests skipped locally and reserved for isolated CI. The initial unrestricted-worker run had three failures in existing rate-limit/token-catalog tests (two timeouts and one cache-count assertion after a timeout); the unchanged single-worker rerun passed. This is not an all-runs-clean claim. Typecheck, 13 deployment-preflight tests and the 10-module synthetic demo boundary passed.

Typecheck, lint, production build and seven focused Java growth tests passed locally. Browser acceptance and hosted release checks are still in progress at this checkpoint.

The first PR CI/security runs blocked existing Axios 1.18.1 through the npm production audit and Trivy (seven HIGH findings). The root override is upgraded to the official fixed 1.20.0 release, with a lockfile update and no audit suppression or relaxed thresholds. [Official release notes](https://github.com/axios/axios/releases/tag/v1.20.0) describe the option-handling, redirect and HTTP/2 hardening. This is a release prerequisite, not an SEO ranking change. Final checks must cover the updated lockfile.

Exact released revision and production checks will be recorded after verification. No uncompleted run should be described as successful.
