# Growth Scoreboard

## October 4: Organic Search Only

The owner stopped outbound acquisition. No new prospecting emails, follow-ups, contact-form pitches or substitute direct messages are authorized. This supersedes every historical follow-up date below. Product notifications and contact-enquiry delivery are unchanged.

- Authenticated Google URL Inspection now confirms all three existing guides and public `/market-radar` are indexed over HTTPS. Each guide has one valid breadcrumb item. These four URLs were unindexed at the September 29 inspection.
- Google Performance, Web with the 3-month selection, reports **1 property-level impression, 0 clicks, 0% CTR**, with the available chart spanning September 23-29. Query details remain unavailable. This is not evidence of first-place ranking or buyer demand.
- The sitemap report still says **Couldn't fetch / Unknown / 0 discovered**. September 29 was the previous submission date, not a verified last-read date; the last-read cell is blank. An October 4 Google live URL test says **URL is available to Google**; a direct HTTPS request also returns valid XML with status 200. After deployment added the new guide hub, one October 4 sitemap resubmission was accepted. The report has not yet confirmed successful processing; no sitemap was deleted and no repeated resubmission loop was used.
- The new `/guides` hub returned 200 in production. Google accepted one indexing request and added it to the crawl queue; this is not indexing proof. IndexNow accepted 11 changed public URLs (HTTP 200) after release verification. The subsequent test-only release correctly sent no duplicate IndexNow request.
- Aggregate Page Indexing remains processing; HTTPS reports eight HTTPS URLs and no non-HTTPS URLs. Do not treat this as a complete indexed-page count.
- Bing reports sitemap **Success**, last crawled October 1, 16 discovered URLs, zero errors/warnings. Its available performance chart reports zero clicks and zero impressions (July 4-October 3 selection, available table rows October 1-2). Discovery is not proof all URLs are indexed.
- No fresh claim about keyword rankings, replies, enquiries or sales is made this cycle; earlier observations below retain their original dates. No outreach, paid promotion, artificial engagement or trades were performed.

The scoped release adds `/guides`, links it from the existing business navigation and guide breadcrumbs, and removes deployment-derived `lastmod` values from the sitemap. Dates must describe significant page changes, not unrelated releases: [Google's official guidance](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping). No existing article's review date was artificially advanced. See [October verification](verification-2026-10-04.md) for test and release evidence.

## September 29 Resume

Inbox and existing threads rechecked at approximately 09:01 UTC: **0 prospect replies, 0 demo requests and 0 bounce notices observed**. The five stored contact submissions are all identified internal QA tests and excluded. No qualified organic enquiry, pilot, customer or campaign revenue is established.

- Google individually confirms `/white-label-crypto-swap`, `/crypto-swap-integration`, `/for-wallets` and `/for-web3-agencies` are now indexed over HTTPS. These four were unindexed on September 25; `/business` had already been confirmed indexed then.
- Search Performance (Web, 3-month selection, available chart September 23-26) now reports **1 property-level impression, 0 clicks, 0% CTR**. Six page rows each show one impression: home, business and the four buyer pages. Do not sum URL rows into six property impressions. Query breakdown is unavailable. The displayed average position of 1 for this tiny observation is **not** evidence of ranking first for any target buyer keyword.
- Aggregate Page Indexing is still processing. The sitemap report still shows the earlier Couldn't fetch/Unknown result. This is not a claim of sitemap Success; prior actual Google live fetch succeeded. New release verification must recheck public XML/robots accessibility.
- Product Hunt listing is now live, with the actual software description, maker comment, website link and synthetic-demo boundary. [Launch](https://www.producthunt.com/products/swap-assistant?launch=swap-assistant). No buyer enquiry or referral sale is attributable to it yet.
- Eight distinct companies contacted in total, including the five September 25 sends. The September 24 batch received exactly one in-thread follow-up today: Who Develop, Bytez3 and Pixelfield. No further unsolicited follow-up to these three. The September 25 batch remains eligible September 30-October 2 after a fresh reply/objection check.
- Qualification remains 57 prospects: **A6 / B34 / C17**. No new batch was sent merely because work resumed. Paid spend remains zero.

PR 51 merged as `19cd2764d0467d321cd5301991b705b39b4df072`; [CI](https://github.com/madnaelo/wallet-integration/actions/runs/36546199928) and [Security](https://github.com/madnaelo/wallet-integration/actions/runs/36546199839) passed. [Release 36546515295](https://github.com/madnaelo/wallet-integration/actions/runs/36546515295) passed the previous OS vulnerability issue but correctly blocked newly flagged Jackson databind 2.21.4 (CVE-2026-68497). The compatible Jackson BOM patch 2.21.6 is required before deployment, not a scan exception. Final rollout evidence belongs in the subsequent release and PR checks.

Private follow-up receipts: `.dev/growth/followup-2026-09-29-1.json` through `-3.json`; tracker updated to stop without a reply. These remain private, not customer endorsements. The September 25 observations below remain historical, not current aggregate search metrics.

## September 25 Cycle

Inbox checked at 04:55 UTC: **0 replies, 0 demo requests, 0 bounce notices observed** across the eight contacted companies. SENT is not proof of delivery. No positive reply, pilot, customer or campaign revenue is established.

| Metric | Current evidence |
|---|---|
| Google indexing | `/business` individually confirmed indexed; eight other inspected buyer/guide/Radar URLs unindexed |
| Google sitemap | Older report still Couldn't fetch; live Google fetch succeeds; reporting recheck pending |
| Google impressions / clicks / CTR | Processing; unavailable, not zero |
| Bing sitemap | Success, 16 discovered, no errors/warnings; indexed total and traffic unavailable |
| Requested target queries | 13 queries x 2 engines; no domain result on inspected first pages; deeper rank unknown |
| Prioritized prospects | 57: A6 / B34 / C17; [qualification](qualification.md), not proven demand |
| New contacts | 5 personalized Gmail messages: Tech Alchemy, Web3 Engineering, Soken, Blocksmith, Web3 Labs |
| Cumulative contacts | 8; all individual sent receipts retained privately |
| Organic enquiries / qualified demos | 0 observed; no qualified organic attribution established |
| Pilot / customers / revenue | 0 / 0 / 0 for this campaign |
| Domain email | `hello@getswapradar.xyz` forwards through Spaceship to the owner's Gmail; real test received in Spam despite passing authentication; not yet advertised |
| External listings | Product Hunt scheduled for September 26 at 00:01 PT / 07:01 UTC; not live or indexed yet. GitHub linked with useful guide references. [Distribution register](distribution.md) |
| Paid spend | 0 |

SEO evidence: [keyword baseline](search-baseline-2026-09-25.md), [Search Console](search-console-2026-09-25.md). Content work improves existing pages rather than multiplying near-duplicates: widget/custom/licensed comparison, concrete wallet integration acceptance checks, official references, internal links, clearer branded-software offer and email-first CTA. IndexNow only notifies allowlisted public content after exact-revision production health verification.

Next outreach: original September 24 contacts become eligible September 29-October 1; new September 25 contacts September 30-October 2. Check replies/objections first, send at most one useful follow-up, then stop. No follow-up was due or sent this cycle. Private evidence: `.dev/growth/outreach-cycle-2.json` and `.dev/growth/sales-tracker.csv`.

The earlier cycle below is preserved as history. SEO is ongoing; indexing is not a qualified conversation.

### Release Evidence

Growth changes merged in `0bd8c15b69b9c2dea93747b78262aa9c761884e3` (PR 50). [CI](https://github.com/madnaelo/wallet-integration/actions/runs/36097087836) and [Security](https://github.com/madnaelo/wallet-integration/actions/runs/36097087848) passed. Local checks: 296 unit tests passed, 7 database-dependent tests skipped locally and covered in CI, 28 Playwright tests passed, 12 preflight tests passed; lint, typecheck, build, production dependency audit and demo safety passed.

[Release 36097278773](https://github.com/madnaelo/wallet-integration/actions/runs/36097278773) correctly blocked the backend image: cached libexpat 2.8.4-r0 was flagged HIGH, with 2.8.5-r0 reported fixed. No vulnerable image was deployed by this release. The runtime stages now bypass Docker's layer cache so existing package-upgrade commands actually run for each release; build/dependency caching and blocking scans remain. See [Docker's cache explanation](https://docs.docker.com/build/cache/invalidation/). Final deployed revision and IndexNow receipt must be verified from the subsequent release, not inferred from green source CI.

## September 24 Baseline

Baseline: 2026-09-24, 18:03 UTC. Scope: this growth launch, not a claim about all historical project activity. Update from actual search dashboards, protected enquiries and private correspondence. Tests, spam and automatic replies are not qualified interest.

| Metric | Verified position | Meaning / source |
|---|---|---|
| Public sitemap URLs | 16 | Live XML, not indexed-page count |
| Pages indexed | Not yet established | New Google property processing; one business URL indexing request accepted |
| Bing URLs discovered | 16 after resubmission | Sitemap Success, no reported sitemap errors/warnings; not indexing proof |
| Organic impressions | Not yet reported | Google/Bing reporting not mature |
| Organic clicks | Not yet reported | Do not substitute synthetic traffic |
| Relevant visitors | Not measured as unique people | Anonymous page observations cannot qualify a buyer |
| Demo views | Intentionally unmeasured | Demo has no analytics/network requests; CTA clicks are separate |
| Real growth enquiries | 0 observed | Two clearly labelled production QA submissions excluded |
| Sector-fit prospects researched | 50 | 23 HIGH / 27 MEDIUM inferred service fit, not sales qualification |
| Prospects contacted | 3 | Who Develop, Bytez3, Pixelfield; individualized Gmail SENT results |
| Replies | 0 observed | Narrow inbox check at 18:03 UTC; not a prediction of future replies |
| Positive replies | 0 observed | Requires genuine relevant interest |
| Qualified demo requests | 0 observed | Primary milestone remains open |
| Pilot discussions | 0 observed | No invented opportunity |
| Customers acquired by this campaign | 0 | No sale or contract agreed |
| Revenue from this campaign | 0 | No payment received or charged |
| Paid growth purchases | 0 | No ads, lists, tools, subscriptions or backlinks purchased |
| New external directory listings | 0 | Product Hunt authorization pending; GitHub metadata/README improved |

## Next Commercial Action

Review replies in the sending mailbox and actual enquiries in `/admin/enquiries`. Honor an objection immediately and retain only the minimum suppression record needed to avoid recontact. Qualify a positive reply around a concrete product/client need before calling it a demo opportunity. Do not send a second batch automatically.

Private pipeline and sent-message evidence: `.dev/growth/sales-tracker.csv` and `.dev/growth/outreach-sent.json`. The contact form delivers operator notifications to the existing configured inbox; reply enquiries manually using their supplied address. Neither an SMTP handoff nor a Gmail SENT label proves a recipient read the message.
