# Licensed Product Offer (Draft)

Status: updated September 22, 2026. Public software/demo positioning is published
at `/business`; this document is internal rationale, not a signed
license, legal opinion, or promise of revenue. No customer has been contacted.

## Recommendation

Start with a non-exclusive software license plus a separately scoped setup
service. The customer operates its own deployment in its own accounts. Aqeel
retains the reusable product and may license it to other customers. Optional
maintenance is a separate agreement, not unlimited work bundled into a setup fee.

This is a product-and-service business, not a promise that transaction fees will
pay for the purchase. Software sales, maintenance invoices, and on-chain swap fees
must be reported separately. No payment processor or subscription platform is
needed to validate the first offer.

Avoid an exclusive IP sale by default: it could prevent reuse of the very asset
we want to sell repeatedly. Avoid managed hosting initially: it adds ongoing
operations, provider-billing, customer-data and support obligations before there
is a demonstrated buyer. These are commercial judgments, not market guarantees.

## Intended Buyer And Deliverable

Best initial prospect: an existing Web3 team, wallet/community product owner, or
software agency with an audience, an identified operator, and the ability to
obtain the provider access and permissions its use requires. Do not describe
this as a way to bypass financial-services requirements.

Suggested short description:

> A non-custodial swap application deployed under your brand, with wallet
> connections, route comparison, saved activity, token-pair alerts and supported
> signed limit orders. Your users keep their wallets; your team controls its
> deployment and approved provider accounts.

The contracted scope should name one brand, one frontend, one backend/database,
agreed domains, one operator, and an exact feature/provider list. Include source
access only under agreed license terms, reproducible build instructions,
configuration, acceptance tests and a handover session. License terms must spell
out permitted deployments, modification rights, redistribution restrictions,
third-party notices, warranty/support boundaries and ownership of custom work.
No agreement or ownership history has been verified merely by drafting this file.

## What Can Be Demonstrated Honestly

| Capability | Qualification |
| --- | --- |
| Wallet connection and quote comparison | Supported wallets/routes only; execution still requires the user's approval. |
| Same/cross-chain swap preparation | Current live-route policy permits 0x and LI.FI. Availability depends on actual routes, assets, networks and customer accounts. |
| History, favorites, alerts and PWA | Separate backend persistence and notification configuration; push delivery depends on the browser/device. |
| Signed limit orders | Supported protocol-verifiable pairs only. Do not advertise every token or native BTC as automatically executable. |
| Fee configuration | Integrator fee request/response safeguards; not proof of payout or an earnings guarantee. |
| CI/CD and operations | Existing project pipeline is a starting point, not permission to deploy a customer's copy into Aqeel's resources. |
| Branding | Shared brand configuration and deployment preflight exist. Customer configuration and operator/legal copy still require scoped review; no multi-tenant configurator is offered. |
| Revenue reporting | Trusted settlement ledger and protected admin reporting exist. Independent evidence is required; unsupported proof stays unverified. Browser history is not audited revenue. |

## First Sale Process

1. Qualify the operator, intended market, existing audience, budget, provider
   access and desired scope before promising a launch date.
2. Give a short demo using preview mode and synthetic history. Do not demonstrate
   with private customer data or ask for a seed phrase, private key or custody.
3. Propose a fixed-price paid pilot with explicit acceptance criteria and a
   limited defect-correction period. Customer-specific features are separate.
4. Agree license and statement of work before distributing source or credentials.
   Use the current [pilot offer](pilot-offer.md) for test pricing and proposed
   payment milestones; do not invent validated willingness to pay.
5. Deploy into separate customer-owned accounts and complete the
   [delivery checklist](customer-delivery.md). Provider approval, operator
   eligibility and owner-signed fund tests are explicit prerequisites to live use.
6. Offer maintenance with named hours, supported versions, response windows and
   exclusions. Do not promise 24/7 coverage without staffing it.

Measure qualified conversations, demos, written offers, paid pilots, delivery
hours, support hours and gross margin. Swap volume is a different business metric.
Do not build a large sales/tenant platform before learning whether this offer sells.

## Open Commercial Decisions

- License ownership and redistribution terms need an actual agreement. Do not
  assume all dependency code, logos or third-party assets can be sublicensed.
- The test pilot price and support window are defined in [pilot-offer.md](pilot-offer.md).
  An actual commitment still needs a scoped customer agreement; there is no
  signed buyer, recurring revenue, or measured acquisition cost yet.
- The owner's regulatory correspondence remains relevant. Software licensing
  is not automatically a legal exemption. Preserve the
  [operator record](../legal/vara-response-2026-08-27.md).
