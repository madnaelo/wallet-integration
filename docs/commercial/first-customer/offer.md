# Wallet Swap Integration Review

**Proposed test offer, October 24, 2026. Not published, contracted or market-validated.**

## Buyer-Facing Description

Before committing to a swap integration, find out what your product can reuse
and what still needs engineering. We assess one defined web-wallet swap journey
for your product and deliver a written integration map, fit/gap analysis and
acceptance plan. The recommendation may be to reuse Swap Assistant, use a provider
widget, or commission custom work. Buying our software is not required.

Proposed assessment price: **AED 1,000**, with applicable taxes and final terms
to be stated in a written quote. No payment or delivery date is accepted here.

## Exact Scope

One identified product, one operator and one agreed web-wallet journey. For
example: a browser/mobile-web entry into an external swap experience, an agreed
network/pair, quote/review, wallet approvals and onward navigation. Multiple
native SDKs, business models or separate journeys are not silently bundled in.

Deliver one customer-specific report (PDF or Markdown as agreed) containing:

1. Entry, wallet connection, quote/review and return-navigation map.
2. Existing capability versus configuration, custom work and unsupported scope.
3. Required network/provider accounts, operator responsibilities and evidence gaps.
4. Acceptance cases, expected state/evidence, and clearly marked unexecuted tests.
5. A reasoned reuse/widget/custom recommendation, including when not to buy our core.
6. A bounded deployment proposal only if the fit is real, not a promise to deploy.

One consolidated clarification round explains or corrects the same assessed
journey. New connectors, extra networks, a replacement product or implementation
are changed scope, not unlimited revisions. Agree submission/response timing in
the quote; no default turnaround or perpetual support is promised.

Excluded: production implementation/deployment, new connectors/chains/contracts,
independent security certification, legal/regulatory opinions, real-money tests,
custody, liquidity, guaranteed provider approval, unlimited revisions and software
license rights. The review does not automatically grant source or production rights.

## Inputs And Fit Screening

Collect these in the existing message/requirements conversation, not new mandatory
website fields. The buyer must be entitled to share any supplied material.

| Input | Minimum useful detail |
| --- | --- |
| Product and operator | Product description/site or private brief; actual operator and target markets; acceptance contact |
| One journey | Starting screen, target result, network/asset identifiers, amount convention, recipient and return behavior |
| Wallet integration | Existing connector/API documentation; desktop/mobile-web targets and supported signing methods |
| Architecture | Sanitized relevant diagram/interfaces and authorized read-only excerpts if available; no production database export |
| Dependencies | Provider/account status without keys; infrastructure owner; constraints and unanswered approval questions |
| Decision | Reuse/widget/custom alternatives being considered and the decision the report should enable |

Never request seed phrases, signing keys, SMTP/API secrets, customer records or
production admin access. A sufficiently specific brief can be assessed without
repository access; mark resulting evidence limits. Do not upload private customer
code to public issues, this repository, or an unapproved AI service.

**Good fit:** an identifiable team has a real journey and can supply the above
inputs. **Clarify first:** connector is undocumented, required recipient/return
behavior is unclear, or operator/account responsibilities are unknown. **Decline
or rescope:** requests for all tokens guaranteed, custody, regulatory circumvention,
profit promises, a security certification or production coding for this price.

Do not sell the public brochure as a report. Every delivered finding must cite
the customer's own requirement and supporting evidence or explain what is missing.

## Internal Delivery Checklist And Economics

| Step | Output / quality check | Planning hours |
| --- | --- | ---: |
| Bound inputs and access | One written journey; permission to inspect; no sensitive exports | 0.5 |
| Trace actual interfaces | Entry, wallet, server/provider, return and failure map | 1.5 |
| Fit and prerequisite analysis | Per-requirement classification and honest alternatives | 1.0 |
| Acceptance and handover scope | Expected evidence, unverified cases, delivery owner | 1.0 |
| Write, fact-check and sanitize | Customer-specific report; no invented tests or legal clearance | 1.0 |
| Clarification round | Consolidated response within unchanged scope | 1.0 |
| Contingency | Input ambiguity and final consistency check | 1.0 |
| **Total planning allowance** | Not measured delivery performance | **7.0** |

Illustrative internal labor valuation AED 100/hour: AED 700 effort cost. Gross
remainder AED 300 direct, or AED 150 with a hypothetical 15% marketplace fee,
before taxes, FX, withdrawals and overhead. At 10 hours there is no direct labor
margin at this assumption, and a marketplace sale would be negative. These are
cost assumptions, not salary facts or guaranteed margin. Track real hours for the
first accepted review; rescope before accepting work outside this allowance.

No new paid API, hosting or real transaction is needed to deliver the assessment.
Existing tool/time costs still exist. No "zero cost" service promise.

Quality exit: all six deliverables present, every material claim classified,
acceptance cases tied to requirements, no secrets/PII, reviewer can explain why
the recommendation is appropriate, and one clarified report version is retained.

## Relationship To The Pilot

[pilot-offer.md](../pilot-offer.md) remains unchanged: proposed AED 5,000 pilot,
one brand/isolated customer-owned deployment, existing supported scope, and
proposed 50% / 50% milestones. Its support and licensing boundaries still apply.

**Optional proposal, not approved terms:** apply a completed AED 1,000 assessment
as credit toward a later qualifying AED 5,000 pilot for the same product/operator.
That means **AED 1,000 review + AED 4,000 remaining = AED 5,000 total**, not AED
6,000. If the signed pilot retains its existing 50% / 50% structure, allocate the
credit to the first AED 2,500 milestone: AED 1,500 further at scope/license signing,
then AED 2,500 on acceptance. Taxes, platform charges, changed scope and credit
eligibility/expiry/refund treatment require written agreement. No automatic credit,
cash refund, transferable entitlement or changed pilot milestone is created here.

Do not use a marketplace review to route subsequent payments off-platform contrary
to its rules. A later marketplace pilot and any credit need compatible written terms.

## Contracting Gate

Use the real seller identity and current operating facts in the existing legal
records. Do not invent an incorporated entity or assume non-custody/consulting
removes licensing, work-authorization, tax, privacy or marketplace obligations.
Confirm permission to sell the assessment separately from permission to operate a
swap service. Provider commercial eligibility, customer operating permissions,
dependency/asset licenses and the later core license are separate gates.

Before payment: approved scope, verified contracting identities, lawful delivery
and invoicing arrangements, rights/confidentiality terms, acceptance/clarification
boundary, and available delivery capacity. Qualified advice remains necessary for
unresolved legal classification; this technical package is not that advice.
