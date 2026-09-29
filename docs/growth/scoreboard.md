# Growth Scoreboard

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
