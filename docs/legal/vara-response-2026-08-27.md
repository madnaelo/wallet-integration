# VARA Response And Next Decision

Recorded: September 16, 2026

Status: VARA identified a high risk of regulated activity. Final classification,
permission to operate, and qualified-counsel review remain unresolved.

## Verified Correspondence

- Sender: VARA Ecosystem, `Ecosystem@vara.ae`.
- Email dated: August 27, 2026, at 14:51:47 Dubai time (10:51:47 UTC).
- Subject: Request for preliminary regulatory-perimeter guidance for a
  non-custodial swap comparison and wallet-signed order service.
- The message replies to and quotes our August 3 contractual-arrangements
  response. It is a new response, not the July 30 request resurfacing.
- The substantive response says: "There is a high risk that the proposed
  service qualifies as a VA Activity" and recommends qualified legal counsel
  to develop the business model in line with VARA's framework.
- It does not identify a definitive licence category, approve a beta, set a
  deadline, demand payment, or expressly order a shutdown. None of these
  omissions grants permission to operate.
- A mailbox search including Spam and Trash found no later message from
  `vara.ae` as of this review.

The email remains the primary evidence in the project owner's mailbox. Full
headers, quoted correspondence, and private customer data are not copied here.
The owner requested no further email to VARA; no message was sent in this review.

## Interpretation For The Product Decision

This is a factual research note, not a qualified legal opinion. The following
are reasons to obtain a classification, not a claim that a specific licence
has conclusively been determined to apply.

[VARA Schedule 1](https://rulebooks.vara.ae/rulebook/schedule-1-va-activities)
includes arranging asset purchase/sale orders and facilitating matching within
broker-dealer services. Those limbs do not require custody. Our immediate swap
routing and submission of signed limit orders therefore need separate review
from the question of who holds the user's keys.

[Regulation III.A](https://rulebooks.vara.ae/rulebook/general-prohibition-and-exemptions)
restricts business VA activity to the authorised categories and considers
commercial benefits among several factors. Removing fees alone does not
establish an exemption. Nor does calling a public service a technical beta.

The [LI.FI Commercial API Terms](https://li.fi/legal/commercial-api-terms-of-use)
also restrict commercial access to businesses/legal entities, excluding natural
persons acting individually. Their public-endpoint exclusions do not by
themselves establish that our authenticated, fee-collecting integration qualifies.
Provider fee support, account eligibility, and regulatory permission are three
separate checks. The software's `monetization: confirmed` classification is not
evidence that this individual operator has regulatory or contractual clearance.

## Recommended Next Steps

1. Pause public immediate-swap execution and new signed-order acceptance and
   submission pending qualified advice. This is a recommendation, not a
   deployment change or a claim that VARA expressly ordered a pause.
2. Preserve existing records and any existing-order status/cancellation paths.
   Already submitted signed orders can remain executable at the external
   protocol; pausing our worker does not cancel them.
3. Continue private development and simulated testing. Ask counsel to assess
   any proposed public information/alerts-only product separately; do not
   describe it as automatically exempt.
4. Obtain a narrowly scoped written assessment of the current operator and
   feature set using the existing submission and legal-review pack. Request
   concrete allowed/prohibited functions and required permissions, including
   the treatment of outstanding orders during any pause.
5. Evaluate a genuine technology-supplier arrangement with a suitably licensed
   operator if operating directly is unaffordable. Contracts, actual functions,
   provider eligibility, and any outsourcing requirements must be reviewed;
   displaying another company's name or using its API is not sufficient.

No payment, company registration, engagement with counsel, provider outreach,
live configuration change, or deployment was performed during this review.

## No-Cost Consultation Route To Assess

Dubai Legal Affairs Department describes its
[Voluntary Legal Services portal](https://training.legal.dubai.gov.ae/clpd-programme/pro-bono/?lang=en)
as connecting members of the public with volunteer advocates and consultants.
Its [official directory](https://legal.dubai.gov.ae/en/Services/Pages/Legal-Directory.aspx)
can be used to verify practitioners. Eligibility, specialist availability, and
whether the programme covers a proposed commercial crypto business are not
confirmed. No application or appointment has been made.

For any initial consultation, provide the July 23 submission, August 3 reply,
August 27 response, current user terms, and the feature/fee model. Request a
written scope and price before paid work; the owner's no-payment constraint
remains in place.

## Technical Notes For A Possible Pause

- `NEXT_PUBLIC_DISALLOW_MAINNET` controls the ordinary swap preview branch in
  `src/app/swap/page.tsx`. It is not an API access control or a complete service
  shutdown switch; public quote endpoints can still prepare transactions.
- `LIMIT_ORDER_ORDERBOOK_SUBMISSION_ENABLED=false` stops coordinator submission
  paths. It does not itself block new order creation or cancel provider orders.
- `.github/workflows/release-production.yml` currently writes that backend
  setting as `true`. A manual environment-only pause could be undone on release.
- A pause implementation must cover UI, server endpoints, workers, deployment
  configuration, stale clients, and existing orders as one reviewed change.
  Preserve status/cancellation access and backups, and verify public behavior.

The related [legal review pack](production-legal-review.md) remains the central
list of questions for qualified counsel; this note records the new evidence and
the pending product decision.
