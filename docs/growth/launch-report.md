# Growth Launch Evidence

Date: 2026-09-24. Goal: first genuine qualified demo request, then a paid-pilot conversation. This report is not a claim that search visibility or revenue has been achieved.

## Release

Growth implementation: `1fae5c67ca5e5fce2c0407ec9acfda56d8ad2056`, merged through [PR 47](https://github.com/madnaelo/wallet-integration/pull/47) as `8588dfceac52308dcb4f6de2f510d3e5a8254bcd`.

- [Master CI](https://github.com/madnaelo/wallet-integration/actions/runs/36035595242): passed.
- [Master security](https://github.com/madnaelo/wallet-integration/actions/runs/36035595154): passed.
- [Controlled production release](https://github.com/madnaelo/wallet-integration/actions/runs/36035964911): passed; frontend/backend/retained Vercel alias report the exact merge revision, database and protected cohosted application healthy.
- Local verification: 295 frontend/unit tests passed, 7 database-dependent tests skipped locally and exercised by CI's separate Radar job; 232 backend tests passed with isolated PostgreSQL/Flyway V34 and SpotBugs; all 27 Playwright tests passed. Typecheck, lint, production build, production dependency audit and demo preflight passed. No real trades or wallet signatures.

## Pages And Positioning

Four distinct buyer pages: `/white-label-crypto-swap`, `/crypto-swap-integration`, `/for-wallets`, `/for-web3-agencies`.

Three practical guides: `/guides/build-vs-license-crypto-swaps`, `/guides/add-swaps-to-a-wallet`, `/guides/non-custodial-swap-architecture`.

`/business` now leads with reusable branded swap software and the engineering work already implemented. Relevant pages have unique metadata, visible FAQs, breadcrumb/FAQ structured data, existing product imagery and direct demo/contact CTAs. No duplicate non-custodial/cross-chain doorway pages were created; those intents have useful sections on existing pages. No fabricated price, savings, rating, customer or security certification.

The [keyword map](keyword-map.md) records actual Google/Bing result observations and primary competitor sources. Complete exchanges such as HollaEx/AlphaPoint are a different product category. ChangeNOW, SwapKit, Rango and 0x shape buyers' expectations around documented integration; our offer is application software and scoped setup, not a claimed drop-in SDK or liquidity service. Public Radar remains synthetic; private Binance research is not a commercial customer data licence.

## Search Accounts

- Google Domain property verified using a TXT record in the existing Spaceship zone. Sitemap submitted. Google's live inspection of `/business` reported "URL is available to Google" / "Page can be indexed"; its indexing request was accepted into the crawl queue. That is not confirmation of indexing.
- Google's sitemap report initially said "Couldn't fetch" while direct HTTP checks returned valid XML and the live URL test succeeded. Do not silently convert this to an indexing success.
- Bing site verified using the requested CNAME. After resubmission, sitemap status became **Success**, with all **16 URLs discovered** and no reported sitemap errors or warnings. Discovery is not ranking or indexing proof.
- No hosting record, unrelated domain, nameserver, paid service or commercial Radar gate was changed.
- IndexNow was evaluated against its [official protocol](https://www.indexnow.org/documentation). No continuous publisher or additional credential was deployed in this phase; verified sitemap ingestion and Google's manual priority request are the active submission mechanisms.

## Live Audit

Initial live `/business` PageSpeed mobile lab result: Performance 99, Accessibility 96, Best Practices 100, SEO 100; FCP 1.2s, LCP 1.8s, TBT 10ms, CLS 0. [Saved report](https://pagespeed.web.dev/analysis/https-getswapradar-xyz-business/4cbanoq46x?form_factor=mobile). Its contrast finding led to a darker eyebrow text color. These are Lighthouse lab observations, not field Core Web Vitals. CrUX did not have enough real-user data.

The [post-release mobile run](https://pagespeed.web.dev/analysis/https-getswapradar-xyz-business/scca7ippn7?form_factor=mobile), captured at 18:15 UTC, reported Performance **99**, Accessibility **100**, Best Practices **100**, SEO **100**, FCP 1.2s, LCP 1.8s, TBT 10ms, CLS 0 and Speed Index 1.7s. CrUX still reports no field data.

Post-release verification against `https://getswapradar.xyz`:

- All 27 Playwright acceptance tests passed, including 390px and desktop buyer/demo/contact journeys, bounded attribution, GPC opt-out and demo isolation.
- Rendered audit of 17 routes: all returned 200, exactly one H1 each, expected canonical URLs, fitting 390px layouts, no broken internal links and no automated WCAG 2 A/AA violations from axe-core. This is not a complete manual accessibility certification. Desktop/mobile screenshots were reviewed.
- Sitemap contains 16 canonical-domain URLs. Robots points to that sitemap and excludes API/backend/admin paths. Buyer/guide schemas parse as JSON and include visible FAQ/breadcrumb evidence. No fabricated review schema.
- 22 production HTTP/security/build checks passed: correct revision, www redirect, API/admin noindex, private Radar anonymous 401, public live snapshot 503, internal Binance-only mode, untrusted-origin rejection and signing domain. No wallet signature or real quote/transaction was executed.
- A mobile form submission persisted exactly once with `qa_release` attribution and its notification reached the configured Yahoo **Inbox**, verified by the message/reference. The five-second QA assertion expired before observing the toast; the retry first checked storage and did not resend that enquiry.
- A separate labelled desktop form submission displayed the real success confirmation; its attribution and resolved admin state were verified. Its notification reached SMTP `sent` on attempt 2 through the existing bounded retry worker and was subsequently verified in Yahoo **Inbox** after reconnecting Chrome. Both are QA, not leads. One labelled anonymous event was submitted twice with the same ID and stored once. The admin dashboard opened with the existing key, cleared on lock, and denied an anonymous report request.

Private evidence: `.dev/growth/live-audit.json`, `.dev/growth/production-boundaries.json`, contact verification JSON, screenshots and `.dev/growth-production-browser.log`. Accessibility injection used a separate bypass-CSP context; the actual demo security/browser tests did **not** bypass CSP. QA observations are excluded from business metrics.

## Attribution And Contact

V34 adds sanitized contact attribution and bounded anonymous observations. No analytics cookies, persistent visitor ID, wallet/transaction export or third-party pixel. DNT/GPC suppress optional reporting. The demo makes no analytics request, and actual demo views are deliberately not measured. A demo CTA is not a verified demo view.

`/admin/enquiries` uses the existing admin key, noindex headers and memory-only unlocked state. It shows the latest 100 enquiries, status controls and bounded event/submission summaries. Only server-accepted contact records count as stored enquiries; tests and spam still require exclusion. Existing transactional contact/outbox/SMTP processing remains in use.

## Email And Distribution

The existing authenticated contact SMTP setup was preserved. Free ImprovMX forwarding was researched, but account password/terms completion requires the owner at the signup screen. No MX/SPF/DKIM/DMARC change was made, and `hello@`/`sales@` must not be advertised as working yet. Free forwarding is not authenticated outbound; ImprovMX's free plan has no SMTP allowance. No domain sender was spoofed.

GitHub homepage now points to the canonical domain, its description explains the software offer, and topics cover relevant implementation areas. README links to the safe demo, business page, screenshots and architecture. Repository visibility/access did not change.

Product Hunt preparation reached GitHub's read-only profile/email authorization screen. Approval is pending; no listing was submitted. No paid directory, backlink purchase, forum blast, fake review or unrelated public post was made.

## Prospect Research

[prospects.csv](prospects.csv) contains 50 public-source sector-fit candidates: 23 HIGH, 27 MEDIUM. Country/entity/role gaps are explicit, not fabricated. These are not 50 sales-qualified opportunities. Buying need, timing, authority and budget remain unverified unless an actual conversation establishes them.

| Priority | Candidate | Specific fit to investigate |
|---|---|---|
| 1 | Who Develop | Next.js/Web3 and LI.FI experience; application workflow reuse for client projects, not replacement routing |
| 2 | Bytez3 | EVM/Solana DeFi and mobile wallet-adapter work; scoped review/handoff reuse |
| 3 | Pixelfield | Wallet/exchange application services; branded non-custodial component, not a full exchange |
| 4 | Digisol | Wallet/DeFi frontend engineering; repeated review-state implementation |
| 5 | CryptoHub Agency | Next.js dApps and mobile WalletConnect flows; transaction-state UX |
| 6 | Tomnitive | Wallet/DeFi studio; reusable review and activity foundation |
| 7 | MagnusMage | Wallet and dApp delivery; optional branded swap application |
| 8 | AproveiTech | Non-custodial wallet and white-label services; separately licensed client deployments |
| 9 | Linum Labs | Wallet-related Web3 product engineering; integration plus operational workflow |
| 10 | LimeChain | Wallet integration; signing, rejection and failure-state handling |
| 11 | INC4 | DeFi engineering; app layer around protocol work |
| 12 | 4soft | DeFi case study; review/activity reuse alongside bespoke engineering |
| 13 | EvaCodes | DeFi wallet and Solana services; scope supported app integrations |
| 14 | Blaize | Wallet/cross-chain work; app-layer review/history complement |
| 15 | Rather Labs | Blockchain product engineering; reusable review/tracking for client builds |

Individual source URLs, public contact channels and proposed angles are in the CSV. First-batch corporate status was checked against Companies House for [Who Develop](https://find-and-update.company-information.service.gov.uk/company/09096989), [Bytez3](https://find-and-update.company-information.service.gov.uk/company/17384507) and [Pixelfield](https://find-and-update.company-information.service.gov.uk/company/10937388), all active private limited companies. Their published generic business inboxes were chosen; no private email list was purchased.

The first batch is capped at three individually written messages from the authorized personal mailbox, with truthful software-only scope, campaign-level links, genuine identity and a reply opt-out. [Outreach guides](outreach.md) cover agency, wallet and technical-partner variants. The private send ledger is authoritative; a draft or prepared template is not a sent message, and a sent message is not proof of delivery or interest.

Actual initial outreach on 2026-09-24: **Who Develop, Bytez3 and Pixelfield**, individually sent through Gmail between 18:00 and 18:01 UTC. All three returned Gmail's SENT status. No prior thread/objection was found in the narrow pre-send mailbox search. No reply, positive response or demo request had been observed at the 18:03 UTC check. Private message IDs/bodies and all 50 pipeline rows are in `.dev/growth/outreach-sent.json` and `.dev/growth/sales-tracker.csv`; the public CSV is the research record, not a public disclosure of correspondence. No automated follow-up is scheduled.

**The first qualified demo-request milestone has not yet been achieved.** See [scoreboard](scoreboard.md) for measured and unavailable values rather than invented conversions.

## Remaining Owner Actions

- Complete the free ImprovMX signup password/terms step if a forwarding alias is wanted; account/DNS/delivery work can then continue.
- Approve or decline Product Hunt's requested read-only GitHub profile/email access before listing work continues. No repository permission was requested.
- A valid business postal address is needed before considering jurisdictions/campaigns that require one, including US commercial email. No US outreach was sent without it.
- Google accepted sitemap resubmission after browser reconnection but still displayed its earlier fetch error. Bing now reports Success with all 16 URLs discovered. No claim is made that the seven new pages have already been indexed.

## Deployment Follow-up

The documentation-only release of `ba7589a` passed CI/security but stopped before backend replacement/frontend promotion on an intermittent shell route-check failure. The valid Caddy site was rejected by a `printf | grep -q` pipeline under `pipefail`; an isolated repeat reproduced the failure with unchanged input. The route predicate now uses a here-string, preserving the existing validation rule without a producer pipe. The existing deployment contract exercises valid and invalid ports plus 100 repeated checks of a large site block. The already verified `8588dfc` application remained healthy; no cohosted application or security gate was bypassed. Final release/revision evidence is recorded separately after the normal pipeline completes.

No new trading feature, provider, chain, Radar algorithm, custody capability, paid service or automatic trading was added. Technical growth readiness does not change regulatory records or grant legal clearance.
