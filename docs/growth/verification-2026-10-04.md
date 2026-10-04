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

Typecheck, lint, production build and seven focused Java growth tests passed locally. The initial browser suite had 28 passes and one new-test selector failure because it assumed only one JSON-LD block; the page has both site-wide WebApplication and CollectionPage data. The test now selects the schema by type and checks that it matches the visible guide links. SEO/Radar acceptance visits explicitly mock growth observations to avoid inflating real analytics.

After the selector correction and analytics isolation, the full local browser suite passed **29/29** (53.3 seconds, one worker). Guide screenshots at 320/390/1440px check fitting content, and image loading is asserted before capture. Desktop/mobile screenshots were inspected. The updated Axios build, production dependency audit and 298 unit tests also passed. No real wallet, transaction or production form submission was used for these tests.

The first PR CI/security runs blocked existing Axios 1.18.1 through the npm production audit and Trivy (seven HIGH findings). The root override is upgraded to the official fixed 1.20.0 release, with a lockfile update and no audit suppression or relaxed thresholds. [Official release notes](https://github.com/axios/axios/releases/tag/v1.20.0) describe the option-handling, redirect and HTTP/2 hardening. This is a release prerequisite, not an SEO ranking change. Final checks must cover the updated lockfile.

## Hosted Evidence

Release approval requires the existing CI and Security gates, followed by the controlled master release and exact-revision health checks. The [PR 53 checks and final verification receipt](https://github.com/madnaelo/wallet-integration/pull/53) retain the run links, final test totals, released revision and production observations without rewriting historical evidence in this note. The first failed runs remain visible; a pushed branch is not itself a production deployment.

PR 53 merged as `6000dc0fc1f58555ee5c13079dae596ad085959f`; master [CI](https://github.com/madnaelo/wallet-integration/actions/runs/37225459763) and [Security](https://github.com/madnaelo/wallet-integration/actions/runs/37225459703) passed. [Release 37225670934](https://github.com/madnaelo/wallet-integration/actions/runs/37225670934) correctly blocked the backend image on four HIGH Jackson 2.21.6 findings before any deployment. The Jackson BOM is updated to 2.21.7, preserving module alignment and the existing scanner thresholds. [Official patch notes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-2.21.7) identify the fixes for CVE-2026-89407, CVE-2026-89425, CVE-2026-91776 and CVE-2026-91777. The final production receipt must reference the subsequent patched release, not this blocked attempt.

PR 54 supplied the Jackson patch; PR 55 completed contact-page analytics mocking and made the existing asynchronous token-request assertion wait for its result. Revision `b1fca7fd84b0d7c0e5fbfe77cb484472ab65a9aa` passed [CI](https://github.com/madnaelo/wallet-integration/actions/runs/37226990327), [Security](https://github.com/madnaelo/wallet-integration/actions/runs/37226990382) and [Release](https://github.com/madnaelo/wallet-integration/actions/runs/37227187989). Frontend, backend and retained alias returned that exact healthy revision; all seven checked public/private page shells returned 200, the sitemap contained 17 canonical public URLs, demo remained noindex with `connect-src 'none'`, and cohosted health returned 200.

Production browser verification then passed 28/29: the desktop buyer journey reproduced the previously observed fast-click demo-tab failure. The new readiness fieldset keeps the synthetic demo's controls disabled until React attaches their handlers, reusing the contact form's readiness pattern without importing any live services. A deterministic test delays JavaScript, checks disabled controls, then releases it and verifies the Radar tab opens. This is an actual interaction fix, not a retry or relaxed assertion. The final receipt linked above must report the follow-up revision and production rerun.
