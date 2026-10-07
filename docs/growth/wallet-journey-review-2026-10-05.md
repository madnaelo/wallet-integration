# Wallet Integration Journey: Review Package

## Scope And Baseline

October 5, 2026; observations collected approximately 16:50-17:06 Asia/Dubai
(12:50-13:06 UTC). Base: `36563be068eb6593196786c01589956495410f2c`, verified
against fetched `origin/master` with a clean starting worktree.
Branch: `feat/wallet-integration-enquiry-journey`.

Work resumed October 7 after interruption; fetched `origin/master` still matches
the same baseline. Dashboard observations below remain dated October 5, not
relabelled as October 7 measurements.

One PR for review only. No merge, release, preview deployment, sitemap submission,
indexing request, outreach or external content publication is authorized by this
milestone. Earlier scoreboard entries remain historical observations.

## Fresh Read-Only Evidence

| Source and reporting window | Observation | Limitation |
| --- | --- | --- |
| Google Domain property `sc-domain:getswapradar.xyz`, Web, 3 months; available chart September 23-October 3; UI updated 4.5 hours earlier | 69 property impressions, 0 clicks, 0% CTR; aggregate average position 70.8 | Different available window from October 4's observation; not a controlled uplift comparison or target-keyword rank |
| Google query table in the same window | `market radar` 23 impressions; `marketradar trading` 20; `marketradar` 17; `web3 browser with swaps` 2; `swap crypto api` 1; `wallet cross-chain swap integration` 1; all 0 clicks | Visible rows need not sum to property totals; mostly Radar intent, not proven software buyers |
| Google page table in the same window | Public Radar 61 impressions; integration page 4; business, fees and white-label pages 2 each; home, wallet landing, agency landing and wallet guide 1 each; all 0 clicks | Do not sum URL rows into property impressions; attribution to a particular change is unsupported |
| Google Page Indexing | Still processing | No current complete indexed-page count or crawl-error breakdown available |
| Bing, All traffic, July 5-October 4 selection; available daily rows October 1-3 | 0 impressions, 0 clicks; no keyword rows | No evidence of keyword positions or indexed total |
| Bing sitemap | Success, 16 discovered URLs, last crawl October 1, 0 errors/warnings | Discovery is not indexing; the newer 17-URL sitemap has not been shown as processed |
| Protected contact endpoint, latest 100 without a date filter, read October 5 | Returned 5 records dated September 23-24, all resolved and explicitly labelled internal QA. Exclude all 5; 0 non-QA enquiries in the returned set | No production form submission, status mutation or email. Not an audit of separate mailboxes, prospect replies or all historical business activity |

Authenticated Google, Bing, Vercel and protected enquiry access worked. No
owner-only sign-in step was needed. Real enquiry messages, addresses, credentials
and request IPs are not included in this report.

## Bounded Sitemap Diagnosis

- Exact submitted URL: `https://getswapradar.xyz/sitemap.xml`, under the Google
  Domain property above. List: submitted October 4, Unknown / Couldn't fetch /
  0 discovered, last-read cell blank. Detail view separately displays Last read
  `10/4/26` and "Sitemap could not be read". Preserve this UI discrepancy rather
  than replacing the historical blank-cell observation with an invented date.
- Direct HTTPS GET at 12:58:54 UTC: 200, `application/xml`, XML declaration and
  sitemap namespace, 17 absolute canonical public URLs. `robots.txt`: 200,
  sitemap points to the exact URL, `/` allowed and private/API paths disallowed.
- One Google live URL inspection at 16:59:14 Dubai: Google Inspection Tool
  smartphone, crawl allowed Yes, fetch Successful, indexing allowed Yes.
  **This is a fetch test, not evidence the sitemap processor recovered.**
- Authenticated Vercel request logs, last-hour view around 16:02-17:02 Dubai,
  show `/sitemap.xml` and `/robots.txt` returning 200 at the live-test timestamp,
  plus the direct checks. No historical failing fetch was identified. The UI's
  older 12-hour/day log windows require Pro; no paid upgrade was made.
- Firewall's past-day overview (October 4-5, around 17:01 Dubai) showed active
  platform protection, approximately 2.3k allowed, 615 denied and 3 challenged
  requests, attributed in aggregate to DDoS mitigation. No custom rules, no
  persistent actions, and no active alerts were shown. These aggregates are
  **not proof that Google sitemap requests were blocked**. IP ownership or a
  user-agent string alone does not establish crawler identity.
- Fact: current direct and Google inspection fetches work while processing
  still reports failure. Hypotheses: delayed reporting or a prior/transient
  fetch problem. Root cause is not established with the retained evidence.
  No DNS change, crawler spoofing, security exception, resubmission or retry loop.

## Before And After

Before: wallet landing described capabilities; the guide supplied a checklist,
but not one connected entry-to-handover example. Both commercial CTAs reached
a generic "How can we help?" header, despite prefilled commercial messages.

After:

1. `/for-wallets` identifies licensed application delivery, links to the worked
   example and existing comparison, and offers a compact sample handover package.
2. `/guides/add-swaps-to-a-wallet#worked-example` traces an illustrative linked
   web journey, identifies customer return navigation as custom work, separates
   frontend/server/provider/customer duties and classifies scope honestly.
3. The same guide's existing `#acceptance-checklist` is reused, with expected
   evidence and explicit unverified-case handling. No copied comparison table.
4. `#sample-pilot` on the existing wallet landing is the single public handover
   summary, linked from the guide. No new price, deadline or license/support right.
5. Existing branded-demo and paid-pilot contact URLs now have matching headings,
   email-first fit/scope instructions and optional-call wording. Prefill, fields,
   consent, submission code, validation, rate limits, dedupe, attribution and
   durable delivery stay unchanged. General contact remains available.

No new SEO URL, provider, migration, dependency addition or tracking mechanism. The
sample does not claim a customer implementation, connector certification or
real-money acceptance. Private claim-to-source evidence is retained in
`.dev/growth/wallet-journey-claims-2026-10-05.md`; do not publish that file.

## Proposed 28-Day Measurement Review

Proposal only: after a separately approved release, review the first 28 complete
days against the preceding 28 days using the same engine, property, filters and
page/query segments. Set the checkpoint to release date plus 28 complete days,
then allow for reporting lag. **No monitoring
or reminder has been scheduled.** This PR itself does not start an exposure window.

- Primary outcome: manually qualified integration enquiries from relevant teams
  describing a concrete use case. Exclude QA, spam and automatic replies; do not
  equate accepted delivery with qualification or a sale.
- Search: impressions/clicks for the wallet landing and guide, relevant integration
  queries, indexed status and sitemap processing. Keep Radar queries separate.
- Journey: existing first-party landing, demo-CTA and contact-open observations,
  plus server-stored enquiry type and bounded attribution where present. CTA
  clicks are not demo views; events are not unique people. No new instrumentation.
- Quality: record whether enquiries identify a product/use case and whether the
  first fit review establishes a relevant next step. Do not make missing scope,
  budget or timing a new required form field.
- Treat missing attribution and DNT/GPC gaps as unknown. At these volumes, do not
  claim causal conversion uplift or statistical significance. If exposure is still
  low, review discovery and query relevance before adding more URLs or features.

## Narrow Security Blocker

The October 7 rerun of the existing production dependency audit failed on two
high-severity advisories. This is the milestone's demonstrated-release-blocker
exception, not a general dependency refresh:

- `sharp` 0.35.4 -> 0.35.5, with its matching platform/libvips binaries, for
  [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- `source-map-js` 1.2.1 -> 1.2.2 for
  [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Production audit passes after these compatible patches. Unrelated lockfile
metadata churn was removed. No audit exception, scan suppression or CI-policy
change was added. The full development-inclusive npm audit still reports five
affected packages from one unpatched `braces` advisory in the ESLint dependency
chain: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Do not describe this as a zero-finding full dependency tree or downgrade Next.js
to follow npm's proposed major-version workaround.

## Validation

Local validation completed October 7 with the patched lockfile:

| Check | Observed result |
| --- | --- |
| Frontend unit tests | 306 passed; 7 database-dependent Radar tests skipped locally because no isolated test database was configured |
| Deployment/domain/IndexNow preflight tests | 13 passed; no live indexing notification sent |
| Demo dependency preflight | Passed, 10 source modules; no wallet/provider/config imports |
| Lint, typecheck and production frontend build | Passed |
| Existing production npm audit | Passed; the development-only advisory above remains disclosed |
| Full local Playwright suite | 35 passed without retries; includes 5 new journey/contact tests |
| Focused backend tests, offline Maven | 23 passed: ContactSubmissionServiceTest (6), GrowthTest (7), ApiRequestGuardFilterTest (10) |

New browser coverage visits the linked guide/checklist/sample handover/contact
journey at 320, 390 and 1440 pixels, submits only mocked enquiries, checks retained
attribution, consent/required-field behavior, a mocked 429, general contact reset,
ambiguous query fallback, canonical tags and no horizontal page overflow. Nine
screenshots of the worked example, sample package and paid-pilot form were visually
inspected. They are generated under `test-results/wallet-*.png`; the existing CI
browser-evidence artifact retains these on each run for 14 days.

The first October 5 run found a genuine presentation bug: client-side navigation
to generic contact retained uncontrolled commercial form defaults. The added
general-contact link now uses a full navigation; the regression passes. An existing
no-JavaScript guide test also hit its 30-second timeout in that first run; it passed
unchanged in the final full run. No timeout or assertion was weakened.

The PR review receipt records the exact head SHA and hosted CI/security results,
including isolated database/full backend checks. Browser tests mock both contact
submissions and analytics. No wallet, real transaction, production enquiry or email
is used. Hosted CI/security gates and the strict synthetic-demo boundary remain
unchanged; do not deploy this PR. No customer connector or real-money acceptance
test is claimed by these results.
