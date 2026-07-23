# Swap Assistant

## Formal Activity Description, Business Plan, and Dubai Operating Setup

**Submitted to:** Virtual Assets Regulatory Authority (VARA), Ecosystem Team  

**Submission date:** July 23, 2026  

**Operator:** Syed Aqeel Ashiq, acting personally as an individual  

**Place of operation:** Dubai, United Arab Emirates  

**Service:** [Swap Assistant](https://wallet-integration-theta.vercel.app)  

**Contact:** Reply to the submission email or use the service's
[contact form](https://wallet-integration-theta.vercel.app/contact)

### Important Scope Note

This is a factual description of a proposed software service and its current
controlled-beta implementation. It is not a legal opinion or legal memorandum.
The operator does not authorize any paid regulatory or legal review through
this submission. Before VARA undertakes work that would incur a fee, please
provide the proposed scope and fee in writing and await the operator's express
written acceptance.

## 1. Executive Summary

Swap Assistant is a self-directed, non-custodial software interface that:

1. compares executable swap quotes supplied by independent third-party
   providers;
2. lets the user select a route and approve the transaction in the user's own
   external wallet;
3. optionally stores wallet-authenticated activity, favorites, notification
   preferences, and price alerts; and
4. supports narrowly scoped, provider-verifiable limit orders for eligible
   token pairs where the user signs the exact order terms before the backend
   can submit the unchanged signed payload to a third-party protocol.

Swap Assistant does not hold customer funds, seed phrases, private keys, wallet
passwords, or broadly reusable signing authority. It does not act as principal,
counterparty, market maker, custodian, proprietary-liquidity provider, or
investment adviser. Immediate swaps cannot move funds unless the user approves
the final transaction inside the user's wallet.

The service is presently an early, publicly reachable controlled beta. It has
no material customer base, no paid marketing campaign, and no verified
production fee revenue. Broad commercial promotion is being held pending
regulatory-perimeter guidance and completion of the remaining launch checks.

## 2. Operator and Intended Dubai Setup

- **Legal operator:** Syed Aqeel Ashiq, acting personally as an individual.
- **Operating location:** Dubai, United Arab Emirates.
- **Current legal form:** No company or other incorporated Swap Assistant
  entity has been formed.
- **Personnel:** The operator currently performs product management, software
  development, deployment oversight, monitoring, and user support. There are
  no employees, agents, brokers, dealers, or customer-facing trading staff.
- **Premises:** The service is online-only and has no customer trading floor,
  branch, cash desk, or physical custody facility.
- **Technology hosting:** The public Next.js application and server-side quote
  route run on Vercel. The Spring Boot application and private PostgreSQL
  database run on Oracle Cloud Infrastructure behind HTTPS. GitHub Actions is
  used for controlled build, security-check, and deployment workflows.
- **Customer support:** Users contact the operator through the service's
  online contact form.

Development, operational monitoring, and business decisions are currently
performed by the operator from Dubai. The operator is requesting confirmation
of the appropriate legal and licensing setup before broad commercial launch.

## 3. Proposed Activities

### 3.1 Immediate Quote Comparison and User-Approved Swap

1. The user selects source and destination networks, tokens, amount, slippage,
   and recipient.
2. The server-side quote route asks only configured third-party providers that
   support the selected route.
3. Provider responses are normalized and ranked by the estimated net amount
   the user would receive. One provider's failure does not prevent another
   valid quote from being shown.
4. The interface discloses the selected provider, estimated receive amount,
   minimum receive amount, service fee, network cost when available, price
   impact or route warnings, and quote expiry.
5. The user chooses a quote.
6. The user's external wallet displays the transaction request. The user can
   approve or reject it.
7. Only the user's wallet can sign and submit the transaction. Swap Assistant
   cannot sign it or move the funds independently.

Production quote routing currently uses 0x for supported same-chain EVM routes
and LI.FI for provider-supported same-chain, cross-chain, Solana, and native
Bitcoin routes. Other provider adapters remain disabled from production quote
routing while their commercial terms are unresolved.

### 3.2 Saved Activity and Notifications

A user may sign a human-readable wallet-authentication message to create a
short-lived application session. This proves control of a public wallet address
for access to saved features. It does not approve a swap or grant transaction
authority.

Authenticated features can include swap history, favorite pairs, target-price
alerts, reverse-swap profit or loss alerts, and notification preferences.
Notifications may be delivered through Telegram, email, or Web Push. An alert
contains a link back to a prefilled swap form; the user must obtain a fresh
quote and approve any transaction in the wallet.

### 3.3 Provider-Verifiable Limit Orders

Limit Orders are a separate flow and are available only where a compatible
third-party signed-order protocol supports the selected assets and network.

1. The interface constructs exact order terms, including maker, network,
   source asset, destination asset, sell amount, minimum receive amount or
   limit rate, recipient, expiry, and protocol terms.
2. The user's wallet displays and signs those exact terms.
3. The backend verifies the authenticated wallet, signature, canonical payload
   hash, assets, amounts, recipient, network, expiry, and selected protocol.
4. The backend stores the signed record and may transmit only that unchanged
   provider-verifiable payload to the selected third-party protocol.
5. The protocol or its independent solvers may fill the order only within the
   signed constraints. The backend cannot alter the signed terms without
   invalidating the signature.
6. Cancellation follows the selected protocol's process and can require a new
   wallet signature or an on-chain transaction.

The current implementation can use supported CoW Protocol or 1inch Orderbook
adapters when properly configured. Availability is pair-, network-, liquidity-,
and provider-dependent. Native Bitcoin, native assets, non-EVM assets, and
unsupported cross-chain pairs remain alert-to-confirm rather than automatically
executable unless a matching provider-verifiable signed-intent mechanism exists.

Swap Assistant does not store private keys and cannot create arbitrary
transactions on the user's behalf.

## 4. Transaction and Authorization Boundaries

### Immediate Swap

```text
User selects pair and amount
        |
Swap Assistant requests third-party quotes
        |
User selects a disclosed route
        |
External wallet displays transaction
        |
User approves or rejects in the wallet
        |
User-signed transaction is submitted to the network/provider
```

### Limit Order

```text
User defines exact order constraints
        |
External wallet signs provider-verifiable order
        |
Backend verifies signature and payload integrity
        |
Unchanged signed order is submitted to third-party protocol
        |
Protocol/solver may fill only within signed constraints
```

At no point does Swap Assistant receive a seed phrase, private key, wallet
password, or unrestricted authority to transfer assets.

## 5. Business Model

- The service is bootstrapped by the individual operator.
- There is currently no subscription fee and no proprietary trading activity.
- For a supported route, Swap Assistant can configure a disclosed platform or
  integrator fee of up to **0.20%**. The selected third-party provider includes
  the fee in the route and directs it to an operator-controlled fee wallet or
  shares it under that provider's terms.
- Provider fees, protocol fees, bridge costs, and blockchain network costs can
  be separate and are shown when returned by the provider.
- Routes are ranked by the estimated net amount received by the user rather
  than by expected operator compensation.
- The operator does not take possession of the swap principal, maintain
  customer balances, set a proprietary exchange rate, operate an internal
  order book, or supply liquidity.
- There is no settled production fee, established volume, or verified revenue.

The intended business is a software interface funded primarily by transparent
integrator fees on eligible third-party routes. Any future material change to
the operating or revenue model would be assessed separately.

## 6. Users, Distribution, and Communications

- Intended users are self-directed adults using their own external wallets.
- The service does not accept discretionary trading instructions or provide
  personalized investment recommendations.
- Users choose their assets, amount, recipient, slippage, provider route, and,
  where applicable, signed limit-order constraints.
- The service does not guarantee the best possible market price, execution,
  liquidity, profit, or availability.
- No UAE-specific paid advertising or broad commercial promotion is currently
  planned while regulatory classification remains unresolved.
- Public Terms of Use, Privacy Notice, and Fees & Risks pages disclose the
  non-custodial model, third-party dependencies, fees, execution risks, and
  wallet-approval responsibility.

## 7. Technology, Security, and Records

Current controls include:

- provider credentials and fee configuration kept in server-side environment
  storage rather than browser code;
- HTTPS, secure HTTP-only application sessions, signed wallet authentication,
  short-lived nonces, input validation, and request-rate controls;
- provider timeout and failure isolation;
- quote expiry and bounded quote caching;
- exact provider fee verification before a monetized route is returned;
- canonical payload hashes and signature verification for stored limit orders;
- leased background jobs to prevent duplicate processing across backend
  replicas;
- ownership checks for saved records and cancellation actions;
- automated tests, dependency scanning, static analysis, secret scanning, and
  controlled deployment workflows;
- database backup and operational monitoring procedures.

Stored product data can include public wallet addresses, wallet-authenticated
history, favorites, alert preferences, notification delivery identifiers,
recipient addresses, and provider-verifiable signed limit-order records.
Swap Assistant does not store wallet-authentication signatures after
verification, seed phrases, private keys, or wallet passwords. Public
blockchain records remain outside Swap Assistant's control.

## 8. Principal Third Parties

Depending on the selected feature, the service can interact with:

- Reown/WalletConnect-compatible wallet infrastructure;
- 0x and LI.FI for currently enabled swap quote routes;
- CoW Protocol and 1inch Orderbook for eligible signed-order functionality
  where configured;
- CoinGecko for batched indicative market-price monitoring;
- Telegram, email delivery, and browser Web Push services for notifications;
- Vercel, Oracle Cloud Infrastructure, GitHub, and Upstash for application,
  deployment, and supporting infrastructure.

Swap Assistant does not control the independent operation, liquidity, smart
contracts, solvency, security, or availability of these third parties.

## 9. Current Stage and Proposed Next Steps

The present site is a controlled technical beta used to validate wallet
connections, quote integrity, transaction preparation, signed-order controls,
notifications, operational monitoring, and fee configuration. The operator
intends to:

1. complete controlled technical and settled-transaction tests;
2. obtain VARA's regulatory-perimeter guidance and identify any required
   licence, approval, commercial licence, restrictions, or organizational
   changes;
3. align the public terms, privacy controls, user eligibility, sanctions
   controls, and operating procedures with that determination; and
4. proceed to broader commercial promotion only after those launch conditions
   are understood.

## 10. Guidance Requested

The operator respectfully asks VARA to advise:

1. Whether the immediate user-approved quote-comparison and routing flow is a
   VA Activity in or from Dubai, including Broker-Dealer Services, Exchange
   Services, or VA Transfer and Settlement Services.
2. Whether receiving the disclosed integrator fee changes that classification.
3. Whether storing and transmitting an unchanged, provider-verifiable order
   signed by the user's wallet is a separately regulated activity.
4. Whether the publicly reachable controlled technical beta may remain
   available while classification or licensing is considered, and what
   restrictions VARA expects during that period.
5. Which commercial licence, VARA application, approval, legal form, operating
   controls, or other preliminary process should be followed if any activity
   falls within VARA's perimeter.

If further information would help, the operator can provide a product
demonstration, technical architecture, transaction samples, provider
documentation, security-control summary, and public disclosures.

## 11. Public Reference Documents

- [Service](https://wallet-integration-theta.vercel.app)
- [Terms of Use](https://wallet-integration-theta.vercel.app/terms)
- [Privacy Notice](https://wallet-integration-theta.vercel.app/privacy)
- [Fees & Risks](https://wallet-integration-theta.vercel.app/fees)
- [Contact](https://wallet-integration-theta.vercel.app/contact)

The operator confirms that this submission is accurate to the best of his
knowledge as of July 23, 2026. Material changes to the described activity,
authorization model, custody boundary, or revenue model will be identified to
VARA if further review proceeds.

**Respectfully submitted,**  

Syed Aqeel Ashiq  

Operator, Swap Assistant  

Dubai, United Arab Emirates
