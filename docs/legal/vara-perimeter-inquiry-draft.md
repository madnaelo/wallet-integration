# VARA Regulatory-Perimeter Inquiry Draft

Status: sent July 23, 2026.

Delivery record:

- Sent from: connected operator Gmail account
- Sent to: varaconnect@vara.ae
- CC: operator contact inbox
- Gmail message ID: 19f8e401ed2818fd
- Official contact page: https://www.vara.ae/en/contact/

## Subject

Request for preliminary regulatory-perimeter guidance for a non-custodial swap
comparison and wallet-signed order service

## Message

Dear VARA Team,

My name is Syed Aqeel Ashiq. I am based in Dubai and am developing Swap
Assistant as an individually operated software service. I am requesting
preliminary guidance on the regulatory perimeter before a broad commercial
launch.

Swap Assistant has the following characteristics:

1. It never holds customer funds, seed phrases, private keys, or wallet
   credentials.
2. For an immediate swap, the software requests quotes from selected
   third-party providers, normalizes their returned estimates, and lets the
   user choose a route. The user's external wallet displays and signs the
   transaction. The user can reject it, and the service cannot sign or move
   funds without that wallet approval.
3. A disclosed platform or integrator fee may be included by an approved
   third-party route. The operator may receive or share that fee under the
   provider's commercial terms.
4. Optional saved features include wallet-authenticated history, favorite
   pairs, price alerts, Telegram/email/Web Push notifications, and recipient
   addresses.
5. A separate Limit Orders feature is intended only for provider-verifiable
   orders. The user's wallet signs exact token, amount, minimum-receive,
   recipient, network, expiry, and protocol terms. The backend cannot change
   those signed terms. It stores the signed payload and may transmit that exact
   payload to a third-party order protocol for filling. It never receives
   custody of the assets.
6. The service does not provide personal investment recommendations, promise
   a price or profit, operate an order book, use proprietary liquidity, or act
   as the swap counterparty.

Could VARA please advise:

1. Whether the immediate, user-approved quote-comparison flow is considered a
   VA Activity in or from Dubai, including Broker-Dealer Services, Exchange
   Services, or VA Transfer and Settlement Services.
2. Whether receiving a disclosed integrator fee changes that classification.
3. Whether storing and transmitting an unchanged, protocol-verifiable order
   signed by the user's wallet is a separately regulated activity.
4. Whether the product may operate as a controlled technical beta while a
   classification or licensing process is considered, and what restrictions
   VARA would expect during that period.
5. Which commercial licence, VARA application, approval, or other preliminary
   process should be followed if any part of the service falls within VARA's
   perimeter.

I can provide architecture diagrams, transaction flows, provider agreements,
security controls, public disclosures, and a product demonstration if useful.
I would appreciate guidance on the appropriate next step and contact team.

Kind regards,

Syed Aqeel Ashiq

Operator, Swap Assistant

Dubai, United Arab Emirates

Contact available through the Swap Assistant website
