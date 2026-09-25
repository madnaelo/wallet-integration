# Bounded IndexNow Notifications

Official protocol: <https://www.indexnow.org/documentation>, checked 2026-09-25. An accepted notification is not proof of crawling, indexing or ranking.

`INDEXNOW_KEY` is configured only in the existing project's production Vercel environment and the repository's Actions secret. It is an IndexNow domain-verification value, **not an application authentication credential**. The protocol requires its public text proof. Never reuse an API/admin secret for it, and do not commit the value.

`npm run build` prepares the ignored `public/indexnow-{key}.txt` artifact if configured. Local/CI builds without a key skip it. The release verification job submits only after existing frontend/backend/cohosted health gates pass, and checks the exact deployed frontend commit and HTTPS key proof again. Failed discovery notifications do not roll back a healthy release; the workflow step and logs expose their failure.

Before deployment, the release records the current healthy frontend commit. After deployment it diffs that revision against the release, so content in failed or superseded releases is not missed. The baseline must be a full commit SHA; a missing Git object fails the notification rather than inventing a diff. If the initial health lookup is unavailable, its visible warning accompanies a first-parent fallback. This discovery-only failure never bypasses the release health/security gates.

The diff selects a bounded allowlist of public commercial/editorial pages. A shared content change submits the seven affected buyer/guide URLs. Backend-only, documentation-only, demo and admin changes submit nothing. No user-generated URLs, query parameters, wallets, transaction identifiers, contact contents or private routes are accepted. Destination is fixed to the official IndexNow endpoint; redirects are rejected and requests have timeouts. One submission per execution, no automatic retry on rate limiting.

HTTP 200 means received; 202 means received with validation pending. A rerun can repeat a discovery notification, but it is not a recurring bulk submission job. Check the recorded release result before manually rerunning. Old releases fail the deployed-revision check. Key rotation requires building/deploying the replacement proof before updating the publisher's secret.

The allowlist intentionally excludes `/demo`, `/admin`, APIs, swap inputs and account pages. New public editorial routes must be deliberately added and tested. No paid search service or analytics dependency is introduced.
