# Search Console Evidence - September 25, 2026

Observed in the authenticated Google domain property `sc-domain:getswapradar.xyz` and Bing property `https://getswapradar.xyz/`. This is a dated observation, not a prediction of rankings.

## Google

| URL | URL Inspection result | Action / limitation |
|---|---|---|
| `/business` | URL is on Google; Page is indexed; HTTPS | Confirmed indexed, unlike September 24's pending request |
| `/white-label-crypto-swap` | Not indexed; URL unknown to Google | Indexing request accepted into priority crawl queue |
| `/crypto-swap-integration` | Not indexed; URL unknown to Google | Indexing request accepted into priority crawl queue |
| `/for-wallets` | Not indexed; URL unknown to Google | Indexing request accepted into priority crawl queue |
| `/for-web3-agencies` | Not indexed; URL unknown to Google | Indexing request accepted into priority crawl queue |
| `/guides/build-vs-license-crypto-swaps` | Not indexed; URL unknown to Google | Updated content being released; no claim of indexing |
| `/guides/add-swaps-to-a-wallet` | Not indexed; URL unknown to Google | Updated content being released; no claim of indexing |
| `/guides/non-custodial-swap-architecture` | Not indexed; URL unknown to Google | Discovery via sitemap/internal links; no claim of indexing |
| `/market-radar` | Not indexed; URL unknown to Google | Public synthetic surface only; private Radar is not an indexing target |

The sitemap report retained the older **Couldn't fetch / Unknown / 0 discovered** result, last read September 24. Google's actual **live inspection** of `https://getswapradar.xyz/sitemap.xml` on September 25 at 08:21 Dubai time succeeded: crawl allowed, page fetch successful, indexing allowed, smartphone Google Inspection Tool. XML having no declared canonical is normal. Do not request indexing of the XML itself.

The deployed XML and robots file remain anonymously accessible over valid HTTPS on the canonical domain. The before-release domain verification at 04:58 UTC passed all 22 checks, including exact deployed revisions, sitemap/robots, redirects and private/demo protections. No current fetch failure was reproduced. Remaining report status needs Google processing/recheck; this is **not** a claim that the sitemap dashboard now reports Success. Do not repeatedly delete or resubmit a valid sitemap.

The aggregate Pages and Search Performance reports both say **Processing data, please check again in a day or so**. Impressions, clicks, CTR, organic landing-page traffic and aggregate indexed/discovered totals are unavailable, not zero. One individually proven indexed page must not be reported as the complete site-wide indexed total.

## Bing

September 25 recheck: **1 known sitemap, Success, 16 URLs discovered, 0 errors, 0 warnings**, last crawl September 24. Discovery is not proof that all 16 are indexed. Home reports that data/reports are processing and may take up to 48 hours. Search metrics and indexed-page totals are not yet established.

IndexNow uses the separate [bounded release notification](indexnow.md). An accepted notification is discovery evidence, not proof of crawl, indexing, traffic or ranking.

## Search Positions

See the [26-check keyword baseline](search-baseline-2026-09-25.md). No Swap Assistant result was observed on the inspected first page for any of the 13 requested queries in either engine. Positions beyond that page remain unknown. This does not contradict `/business` being indexed.
