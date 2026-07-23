# Production Legal Review Pack

Prepared: July 19, 2026
Last updated: July 23, 2026

Status: engineering and legal-readiness review complete; a formal factual
submission is pending review by VARA Ecosystem; qualified-counsel review
remains pending.

This document is a factual handoff for legal counsel. It is not legal advice
and must not be used to claim that Swap Assistant, its operator, or its public
documents have been approved by a lawyer or regulator.

## Launch Decision

Broad commercial launch remains gated on these decisions:

1. Obtain VARA or UAE virtual-assets counsel's written classification of the product,
   including whether operating or marketing it in or from Dubai requires a
   VARA licence or another authorization.
2. Have counsel approve the Terms, Privacy Notice, fee disclosure, sanctions
   language, limit-order risk acceptance, liability allocation, and dispute
   provisions as one consistent document set.
3. Record the reviewer's name, firm, jurisdiction, review date, approved
   document versions, and required follow-up date in the review log below.

Software controls do not satisfy these legal gates by themselves.

## Confirmed Operator Record

- Operator: Syed Aqeel Ashiq, acting personally as an individual.
- Place of operation: Dubai, United Arab Emirates.
- Public legal, privacy, and support contact: `/contact`.
- The private delivery inbox is configured only through `CONTACT_RECIPIENT_EMAIL`.
- Public service name: Swap Assistant.
- There is no Luxembourg company or other incorporated Swap Assistant entity.
  Do not describe the service as incorporated, licensed, or regulator-approved
  unless verified evidence is added to this repository.
- The current operating decision is not to target advertising at UAE or
  Pakistan residents and not to impose a location block solely on that basis.
  This decision is not a regulatory exemption or legal-clearance conclusion.
- The public Terms provisionally use applicable UAE federal and Dubai law and
  Dubai courts, subject to mandatory rights and qualified review.

## Product Facts For Counsel

- Swap Assistant compares third-party swap quotes and can add a disclosed
  platform/integrator fee on approved provider routes.
- The service is operated personally from Dubai under the service name Swap
  Assistant; it is not currently operated through a company.
- The normal swap flow is non-custodial. The app does not hold private keys or
  sign transactions. The user reviews and approves execution in a wallet.
- Wallet sign-in proves control of a public wallet address and protects saved
  history, favorites, alert settings, notification devices, and limit orders.
- The backend stores wallet-linked product data in PostgreSQL and sends
  Telegram, email, and Web Push notifications according to user preferences.
- A protocol-verifiable limit order is a distinct flow. The wallet signs exact
  order terms; the backend stores the signed payload and may submit it to the
  selected order protocol. The signature cannot authorize changed assets,
  amounts, recipient, chain, or expiry.
- Third parties include wallet-connection infrastructure, 0x, 1inch,
  Velora/ParaSwap, Odos, LI.FI, CoW Protocol, CoinGecko, Telegram, email
  delivery, Web Push services, Vercel, Oracle Cloud, GitHub, and Upstash.
- Public blockchain transactions and wallet addresses can remain public and
  cannot be deleted by Swap Assistant.
- The service is not intended to provide investment, tax, accounting, or legal
  advice and does not promise execution, price, profit, or availability.

## Provider Commercial Status

The authoritative software policy is
`config/provider-commercial-policy.json`. Quote access is separate from fee
collection. Runtime fee parameters are enabled only for providers whose policy
status is `confirmed`.

| Provider | Quote use | Fee/commercial status | Production treatment |
| --- | --- | --- | --- |
| 0x | Enabled with API key | Official affiliate-fee documentation permits fees on current plans | Fee parameters allowed; live receipt test pending |
| LI.FI | Enabled with API key/integrator | Partner Portal fee wallets configured | Fee parameter allowed; live receipt test pending |
| Odos | Adapter retained | Written account/plan confirmation pending | Disabled from production quote routing |
| Velora/ParaSwap | Adapter retained | Partnership API and fee-sharing approval pending | Disabled from production quote routing |
| 1inch | Disabled in production | Dev Plan active; commercial-use response pending | No production quotes or fee fields |

Provider correspondence and detailed evidence are tracked in
`docs/earning-setup-finalization.md`.

## Personal Data And Retention

Data categories currently include:

- public wallet addresses and wallet provider metadata;
- hashed session credentials, short-lived sign-in nonces, and security logs;
- swap history, favorites, thresholds, recipients, notification preferences,
  and alert delivery records;
- Telegram chat identifiers, optional email destinations, and Web Push
  endpoints and encryption keys;
- signed limit-order payloads, signatures, hashes, accepted terms version, and
  provider lifecycle state;
- names, reply email addresses, topics, and messages supplied through the
  contact form;
- request metadata used for abuse prevention, reliability, backup, and incident
  response.

Current default retention controls expire sign-in nonces after 10 minutes,
sessions after 7 days, dry-run swap history after 180 days, alert-delivery
records after 365 days, and notification-outbox records after 30 days. Saved
contact messages are retained for up to 365 days. Preferences, favorites,
non-dry-run history, device links, and limit-order records remain until the
user removes them where supported or an operational deletion policy applies.
Counsel must review whether fixed retention periods, an account-data deletion
workflow, and a formal data-subject request process are required before launch.

## UAE And Dubai Review Questions

The UAE official data-protection portal describes rights, security, breach, and
cross-border-transfer obligations under the UAE Personal Data Protection Law.
Counsel should determine the operator's controller/processor roles, lawful
bases, consent requirements, transfer safeguards, breach process, and whether
any free-zone privacy regime applies.

VARA's official materials state that virtual-asset activities carried out in
or from Dubai can require licensing. Its activity descriptions include
arranging or facilitating orders and routing them to accepted venues. Counsel
must classify quote aggregation, transaction routing, affiliate compensation,
alerts, and protocol-submitted limit orders, and must address any best-execution
or conflict disclosure created by provider remuneration.

Official starting points:

- UAE data protection laws: https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws
- VARA licensed activities: https://www.vara.ae/en/licenses-and-register/licensed-activities/
- VARA licence applications: https://www.vara.ae/en/licenses-and-register/licence-applications/
- VARA Schedule 1 activities: https://rulebooks.vara.ae/rulebook/schedule-1-va-activities
- VARA Broker-Dealer Services Rulebook: https://rulebooks.vara.ae/rulebook/broker-dealer-services-rulebook

## Public Document Audit

The public pages disclose the individual operator, a contact form,
non-custodial model, wallet approval, third-party dependencies,
platform/provider/network costs, execution risk, alerts as estimates, and
special limit-order risks.
They also contain provisional eligibility, liability, governing-law, dispute,
privacy-purpose, transfer, minors, and rights language. Before counsel can
approve them, the following gaps must be closed:

- whether Dubai and the online contact channel are sufficient or a full
  service address and trade licence disclosure are required;
- enforceability of the provisional governing law, venue, dispute process,
  warranty disclaimer, and liability cap;
- age, territory, sanctions, restricted-person, and restricted-jurisdiction
  rules appropriate to the licensed operating model;
- whether additional indemnity, severability, assignment, and formal notice
  language is necessary;
- final privacy lawful bases, named subprocessors, cross-border safeguards,
  data-subject response process, deletion workflow, and breach procedure;
- precise fee conflicts and whether route ranking is based on net user output
  regardless of provider remuneration;
- final limit-order terms version and evidence that every accepted version is
  immutable and retrievable.

## Counsel Questions

Ask counsel to answer each question in writing:

1. What regulatory permissions, licences, registrations, geoblocks, and user
   eligibility checks are required for the current feature set and fee model?
2. May the product describe itself as non-custodial when it stores and submits
   user-signed protocol limit orders?
3. What sanctions/AML controls are proportionate for quote routing, wallet
   addresses, alerts, and signed limit-order submission?
4. What fee, best-price, conflict, and affiliate disclosures must appear before
   quote selection and wallet approval?
5. Which privacy lawful bases apply to each data category, and what deletion,
   access, correction, portability, objection, consent-withdrawal, and breach
   processes are mandatory?
6. What liability cap, dispute mechanism, governing law, age threshold, and
   territory restrictions are enforceable for the operator and target users?
7. Does the current checkbox and immutable terms-version evidence create valid
   acceptance for protocol limit orders, and what records must be retained?

## Review Log

Do not mark this complete until a qualified reviewer fills every field.

| Field | Value |
| --- | --- |
| Operator legal name | Syed Aqeel Ashiq, individual operator |
| Public legal/privacy contact | `/contact` (recipient address remains private) |
| Place of operation | Dubai, United Arab Emirates |
| Governing jurisdiction | UAE/Dubai provision added; qualified review pending |
| Reviewer and firm | Pending |
| Reviewer qualification/jurisdiction | Pending |
| Documents and versions approved | Pending |
| Approval date | Pending |
| Regulatory classification | Formal VARA Ecosystem submission sent July 23, 2026; response pending |
| Required launch restrictions | Pending |
| Next review date | Pending |
