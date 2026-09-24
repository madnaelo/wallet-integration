# Commercial Data Rights Gate

Reviewed 2026-09-24. This is a technical release decision, not legal clearance.
No public API's reachability is treated as a redistribution license.

| Venue   | Current official document                                                                               | Public availability                                   | Commercial / derived / raw display                                                                                                                                                                | Attribution                                                                               | Decision                    |
| ------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------- |
| Binance | [Terms](https://www.binance.com/en/terms), linked PDF effective 21 July 2026                            | Public spot REST/WS                                   | Section 27's limited personal/internal-business license does not clearly establish this product's commercial analytics or public raw-data rights                                                  | No sufficient redistribution grant established; displaying a venue name is not permission | REQUIRES WRITTEN PERMISSION |
| Bybit   | [API Terms](https://www.bybit.com/en/help-center/article/API-Terms), landing page updated 18 March 2026 | Public spot REST/WS                                   | Development/testing language in 5.1 must be read with competing-product, benchmarking and commercialization restrictions in 6.5-6.9; no assumption of rights to this commercial analytics service | No attribution condition establishing the missing commercial license was found            | REQUIRES WRITTEN PERMISSION |
| OKX     | [API Agreement](https://www.okx.com/help/okx-api-agreement), published 26 March, updated 28 July 2026   | Public endpoints remain covered, authenticated or not | Sections 9.2-9.4 restrict use and require consent for redistribution; analytics-platform restriction expressly matters here                                                                       | Attribution does not cure lack of consent                                                 | REQUIRES WRITTEN PERMISSION |

Binance PDF linked by the official landing page:
https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/bf4879710c904b991848972ec4818ba2cf9e4ce314c09adae84fa2750d3477f7.pdf

Bybit linked terms/PDF:
https://www.bybit.com/en/legal/service-specific-terms/API-Terms
https://www.bybit.com/common-static/compliance/legal/BYBIT/df1923006718fbba8ba70d7d762b9866.pdf

## Runtime decisions

- Binance: private internal research only, based on the limited internal-use
  language. No redistribution, no exchange-logo endorsement, no commercial feed.
- Bybit and OKX: fixture-only testing; actual collection disabled even in research
  mode until permitted scope is established. This is conservative gating, not a
  claim that all imaginable private uses are prohibited.
- Commercial live: OFF for all three. Synthetic public demo: ON.

Technical subscription/rate restrictions are recorded in exchange-connectors.md.
Unresolved items: permission for commercial derived signals and user alerts,
raw display if ever added, storage/retention, customer deployments, regions,
attribution, quotas and any licensing fee. Obtain written approval for the exact
use case; retain it privately and update this record and BOTH code gates through
review. No payment or new account was required or made for this implementation.

Policy sources: src/market-radar/policy.ts and Java MarketRadarPolicy.
No environment variable can bypass an unapproved venue. Regional eligibility
and existing regulatory/provider restrictions remain separate and unchanged.
