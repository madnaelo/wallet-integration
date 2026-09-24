# Growth Operations

Goal: one real, relevant prospect requests a demo, then a scoped pilot conversation. Page counts and synthetic tests are not success.

## Scope And Measurement

- Four distinct buyer pages and three practical guides. No new trading feature, provider, network or Radar algorithm.
- First-party anonymous events: landing, demo CTA and contact opened. Unique event IDs make a repeated request idempotent; they are not persistent visitor IDs.
- The demo deliberately has no analytics request, cookies or storage. Actual demo views are **not measured**. A CTA click is not a completed demo view.
- Only accepted server contact submissions count as stored enquiries. Browser events cannot create a submitted/paid conversion. Stored enquiries still require manual qualification and exclusion of tests/spam.
- Campaign values have length/character bounds; known paths and referral categories replace full URLs. Never put an email, wallet, transaction, secret or person-specific identifier into UTM values. Use campaign-level tags, e.g. `utm_source=outreach&utm_medium=email&utm_campaign=agency_pilot`.
- Context passes through internal links, not browser storage. Direct visits, copied links, privacy signals, blockers and navigation outside the business flow can lose attribution. Counts are observations, not unique visitors, nor proof of identity or causality.
- DNT/GPC suppress anonymous browser observations and form attribution. Campaign parameters already supplied in a visited URL may still exist in normal hosting/access logs; this is not a claim of zero infrastructure logging.
- `/admin/enquiries` uses existing admin protection. Never share credentials or an unlocked dashboard. Admin/API routes remain noindex; no enquiry data is server-rendered publicly.
- V34 adds bounded attribution to contact records and an indexed anonymous-event table. Existing contact dedupe, transactional outbox and SMTP behavior are unchanged. Event retention is 90 days using bounded existing cleanup; contact retention follows the existing 365-day setting.
- Reports are bounded to 1-90 days and 200 groups; messages are limited to the latest 100. Rate limits and request-body bounds apply. Client observations can be spoofed, so they cannot establish revenue or customer qualification.

## Prospect Workflow

The public research list records evidence and separates observed services from inferred fit. Unknown countries/roles are explicitly unknown. Corporate inboxes are preferred; no scraped private personal details or purchased lists.

Before sending: verify current entity/contact, applicable marketing rules and the private opt-out list. Start with a few individually researched UK corporate contacts, not mass mail. Use genuine identity, honest subject, software-only proposition, a working reply address and easy opt-out. Do not send to sole traders/unknown entities on the assumption they are corporations.

Official rules reviewed: [ICO B2B marketing](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/) and [FTC CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business). UK corporate electronic-mail rules differ from individuals; US commercial emails require a valid physical mailing address, among other requirements. This operational review is not legal advice or operating permission for a financial service.

Store message IDs, replies, objections and private sales notes outside the public repository in `.dev/growth/`. Honor objections immediately. No scheduled or automatic follow-up is implemented. Recheck the inbox before any later batch.

## Qualifying A Reply

A qualified demo request must come from a real relevant team and express interest in evaluating this software for a product/client requirement. Establish product, role, network scope, deployment ownership, timing and willingness to discuss a paid pilot. Do not invent budget, buying authority or demand from a company website.

Track researched, contacted, replied, positive, demo-requested, pilot-discussion, customer and revenue separately. A successful test enquiry belongs in QA evidence only. Do not publish a prospect's message or company relationship without permission.

## Email

Existing authenticated SMTP contact delivery remains the baseline. Free forwarding and authenticated outbound are separate capabilities. ImprovMX's free plan supports one domain/25 aliases/500 forwarded messages per day but no SMTP sends ([pricing](https://improvmx.com/pricing/), checked 2026-09-24). Account setup requires owner password/terms acceptance. Do not claim an alias works until a real test is delivered. Do not spoof the domain through Gmail or publish guessed DKIM records. No paid subscription or nameserver migration is authorized.

## Search Visibility

Google Domain property and Bing site ownership were verified through DNS on 2026-09-24. The apex hosting record and www redirect were preserved. Both received sitemap submissions. Submission is not indexing: Google initially reported a fetch error despite a successful direct 200/application+xml check; Bing initially reported processing. Recheck their dashboards after rollout. CrUX initially has insufficient field data.
