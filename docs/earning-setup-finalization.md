# Earning Setup Finalization

Last reviewed: July 23, 2026

This checklist tracks what is required before Swap Assistant can reliably collect
platform fees in production.

## Current Status

- Production frontend is live on Vercel.
- Production backend health is live on OCI.
- Production quote routing and fee collection are restricted to 0x and LI.FI,
  whose current official documentation explicitly supports integrator fees.
  Dormant 1inch, Velora/ParaSwap, and Odos adapters fail closed until written
  terms are recorded as confirmed.
- Vercel production environment variable names exist for provider keys, fee
  addresses, CORS, and cache/rate-limit settings.
- LI.FI Partner Portal fee collection is enabled for integration `the-wallet`
  with default EVM, Solana/SVM, Sui, and Bitcoin receiving wallets.
- EVM route availability is catalog-driven across provider-supported mainnets.
  Native Bitcoin and Solana routes use LI.FI. Every returned route must still
  pass the production provider policy and fee-response validation before it is
  shown as executable.
- `PARASWAP_API_KEY` is still missing. A Velora Pro API/rate-limit request was
  submitted on May 27, 2026, using the public production URL and the project
  owner's contact address. No response was found in the project mailbox as of
  July 17, 2026.
- Treasury receive addresses have been provided. Keep the actual values in
  deployment/provider configuration, not in committed docs, and verify them with
  small real swaps before relying on revenue collection.
- Automated production gates cover frontend/backend builds, tests, dependency
  and secret scanning, provider-policy validation, OCI backup creation and
  restore verification, deployment health, and post-deployment monitoring.
  These controls support a controlled release; they do not replace real
  settlement and fee-receipt checks.

## Fee Address Model

Use one treasury EVM address for the first production release:

- `FEE_RECIPIENT_ADDRESS`: the wallet intended to receive direct platform fees.
- `AFFILIATE_ADDRESS`: fallback/legacy partner wallet address.

For the initial production treasury, set both variables to the same EVM address. The
code prefers `FEE_RECIPIENT_ADDRESS` and falls back to `AFFILIATE_ADDRESS` only
when the fee recipient is blank.

The treasury address must:

- Start with `0x`.
- Be controlled by us, not an exchange deposit address.
- Be usable across Ethereum, Arbitrum, Optimism, Base, Polygon, BNB Smart Chain,
  and Avalanche.
- Be safe to receive many ERC-20 fee tokens.

Recommended path:

1. Use a dedicated treasury EOA for the first controlled production tests.
2. Move to a multi-sig treasury such as Safe once we have volume.
3. If using Safe, make sure the Safe address is available and operational on
   every EVM chain where we collect fees.

Native Bitcoin through LI.FI is separate. LI.FI fee wallets are configured in
the LI.FI Partner Portal. Bitcoin-side fees may require a Bitcoin receive
address there; the app's `FEE_RECIPIENT_ADDRESS` remains EVM-only.

Use self-custody treasury wallets where possible. If an exchange receive
address is used for any provider payout, verify the exact network, memo/tag
requirements, and withdrawal behavior with a small test first.

## Provider Checklist

### 0x

Status: commercial affiliate-fee use confirmed by current official 0x
documentation; code wired; live payout verification pending.

The 0x quote client sends:

- `swapFeeRecipient`
- `swapFeeBps`
- `swapFeeToken`

Action remaining:

- Set the final EVM treasury wallet.
- Run a small real swap and verify the fee reaches the treasury.
- Monitor 0x dashboard analytics.

Reference:

- https://docs.0x.org/evm/0x-swap-api/guides/monetize-your-app-using-swap
- https://0x.org/legal/api-license-agreement

### 1inch

Status: code wired but production-disabled. A May 8, 2026 email confirms that
the account's KYC/KYB verification was approved. It does not grant commercial
or fee-collecting API use. A separate May 15, 2026 email requested
Non-Commercial API Customer Security Due Diligence, so the account's commercial
terms remain unresolved.

The signed-in 1inch Business portal showed an active Dev Plan on July 19,
2026. A support inquiry was submitted that day asking whether the public,
revenue-generating app may use the Dev Plan, fee/referrer fields, and Orderbook
API, and whether a commercial agreement, revenue share, billing change, or
account change is required. Written confirmation is pending.

The 1inch quote client sends:

- `fee`
- `referrer`
- `origin`

Action remaining:

- Confirm our 1inch API account is allowed for commercial/fee-collecting use.
  Gmail shows a KYC/KYB approval email from May 8, 2026, but also a
  Non-Commercial API Customer Security Due Diligence email from May 15, 2026.
  Because Swap Assistant intends to collect fees, do not certify the usage as
  personal/non-commercial unless 1inch explicitly confirms that this is correct.
- Complete 1inch due diligence truthfully. Do not submit as personal
  non-commercial if the app is taking platform fees.
- Keep `1inch` out of production `SWAP_PROVIDERS` and keep
  `ONEINCH_ORDERBOOK_ENABLED=false` until the account terms are resolved.
- Run a small real swap and verify fee behavior.

Reference:

- https://business.1inch.com/portal/documentation/apis/swap/swap
- https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get

### Velora / ParaSwap

Status: quote integration wired; API key and Partnership API/fee-sharing
approval pending. Fee parameters are disabled by runtime policy in the
meantime.

The Velora/ParaSwap client sends:

- `partner`
- `partnerFeeBps`
- `partnerAddress`
- `takeSurplus=true`
- `isDirectFeeTransfer=true`
- `includeContractMethods=simpleSwap,multiSwap,megaSwap` when fee or
  swap-and-transfer behavior is needed.

Action remaining:

- Wait for Velora's response to the May 27, 2026, Pro API/rate-limit request.
  Submitted values were: project name `Swap Assistant`, website
  `https://wallet-integration-theta.vercel.app`, GitHub profile
  `https://github.com/madnaelo`, initial target `5 requests per second`, and
  the project owner's contact address. No response was found in the project
  mailbox as of July 23, 2026.
- A follow-up was sent to Velora support on July 19, 2026, asking explicitly
  for Partnership API approval, an API key/rate-limit decision, and the
  commercial terms for fee sharing.
- Obtain the Velora/ParaSwap API key or confirmation of partner access.
- Add `PARASWAP_API_KEY` to Vercel.
- Run a small real swap and verify fee behavior.
- If Velora does not reply, follow up or keep ParaSwap enabled only as a
  best-effort public-rate-limit provider.

Reference:

- https://developers.velora.xyz/api/velora-api/velora-market-api/get-rate-for-a-token-pair-1
- https://developers.velora.xyz/api/velora-api/velora-market-api/build-parameters-for-transaction
- https://docs.velora.xyz/integrating-velora/integrating-velora-overview/fee-sharing

### Odos

Status: quote integration wired. Delegated-fee request shape is documented and
was accepted in a test quote, but Odos account/plan enablement is unresolved.
Fee parameters are disabled by runtime policy until written confirmation.

The Odos V3 client sends:

- `referralFee`
- `referralFeeRecipient`

Odos documents an automatic 80% partner / 20% Odos split for delegated fees
when `referralFee` and `referralFeeRecipient` are supplied. On May 27, 2026, the
configured API key accepted a Base quote request with those fee parameters and
returned a route id. That confirms our request shape is accepted, but it does
not prove payout until a real swap settles and the treasury receives its share.
The project owner also emailed Odos sales on May 27, 2026, to request explicit
monetization confirmation; no reply was found by July 23. A corrected follow-up
was sent on July 19 with the exact V3 fields and fee value, asking Odos to
resolve the apparent difference between its delegated-fee and pricing pages
and confirm whether the current key/account is enabled.

Action remaining:

- Wait for written account/plan confirmation, then update
  `config/provider-commercial-policy.json` and `MONETIZED_SWAP_PROVIDERS` in a
  reviewed change.
- Run a small real Odos swap and verify that the expected fee reaches the
  treasury.
- Contact Odos if the fee does not appear or if their dashboard indicates that
  provider-side monetization is not enabled for the key.

Reference:

- https://docs.odos.xyz/home/api-monetization
- https://docs.odos.xyz/build/api_pricing
- https://docs.odos.xyz/home/authentication

### LI.FI

Status: code wired, portal payout setup completed.

The LI.FI client sends:

- `integrator`
- `fee`
- `x-lifi-api-key`

The quote adapter rejects a route unless the response preserves the registered
integrator, the requested fee fraction, and an integrator allocation in the
source asset of at least the configured amount. This is a per-route technical
guard; settled fee receipt still requires a small real-transaction check.

LI.FI fee wallet/payout routing is configured in the LI.FI Partner Portal.
On May 27, 2026, fee collection was enabled for integration `the-wallet` with
default EVM, Solana/SVM, Sui, and Bitcoin receiving wallets. The portal also
shows the FeeForwarder upgrade notice, a `Collectable Fees` section, and a
`Withdraw Fees` action.

Action remaining:

- Keep `LIFI_INTEGRATOR=the-wallet` in Vercel and local env files.
- Run a small real BTC/EVM test route only after payout configuration is
  confirmed.

Reference:

- https://docs.li.fi/api-reference/
- https://docs.li.fi/introduction/integrating-lifi/monetizing-integration
- https://docs.li.fi/introduction/integrating-lifi/fee-forwarder

## Production Readiness Items

Before public launch:

- Replace or confirm `FEE_RECIPIENT_ADDRESS` and `AFFILIATE_ADDRESS`.
- Verify fee receipt for each enabled provider and payout mechanism, including
  representative EVM, Solana, and native Bitcoin routes. Repeat the check
  before treating a newly material chain or asset type as revenue-verified.
- Rotate the Telegram bot token because the old token was pasted in chat.
- Keep 1inch, ParaSwap/Velora, and Odos disabled unless their commercial and
  fee terms are explicitly confirmed and recorded in the policy file.
- Run a small LI.FI route and confirm the fee appears under Collectable Fees.
- Keep public fee disclosure, terms, and privacy pages current as provider
  terms and fee settings change.
- Keep clear alert wording that notifications are estimates, not financial
  advice.
- Verify CORS origins after the final custom domain is attached.
- Verify the production-enforced OCI PostgreSQL backup upload and timer after
  each release.
- Configure production monitor secrets so GitHub Actions can send uptime/error
  alerts to Telegram after the bot token is rotated.
- Monitor `/api/health` and `/api/admin/ops/summary` after each deployment.
- Run small real swaps through each enabled provider and record the fee receipt result.
- Keep `MONETIZED_SWAP_PROVIDERS` limited to providers with written or
  unambiguous official commercial approval. Do not treat a successful quote as
  payout approval.
- The confirmed operator is Syed Aqeel Ashiq acting personally from Dubai,
  United Arab Emirates, with public contact aqeel613@yahoo.com. There is no
  incorporated Swap Assistant entity. Obtain VARA or qualified UAE counsel's
  written regulatory classification and counsel-reviewed Terms/Privacy
  language before broad commercial launch.
- Keep the automated daily backup-freshness check and weekly isolated restore
  drill passing. The production release also creates and verifies an Object
  Storage backup before promoting the backend.
- Attach the final branded domain before public marketing.
- Treat Limit Orders as a separate monetization track: current CoW/1inch signed
  order adapters do not add the normal swap platform fee.

For a controlled production release without a branded domain or real-fund
tests, keep these boundaries explicit:

- Route production quotes only through providers marked confirmed in
  `config/provider-commercial-policy.json`.
- Keep Set Alerts disabled unless deliberately enabled by an administrator.
- Treat Limit Orders as limited availability until a signed create,
  reconciliation, cancellation, and fill cycle has been exercised with a
  deliberately small real order.
- Keep Telegram available as the mobile fallback while the recorded Android
  browser push-service failure awaits physical-device verification.
- Do not describe fee payout as verified until an enabled provider settles a
  real swap and the configured treasury receives or accrues the expected fee.

## Remaining Owner Actions

### Telegram token rotation

Needed because the old Telegram bot token was exposed in chat.

Steps:

1. Open Telegram.
2. Search for `BotFather`.
3. Send `/mybots`.
4. Select the bot used for Swap Assistant.
5. Choose API Token.
6. Revoke or regenerate the token.
7. Update production OCI and local development env files with the new token.

### Fee receipt verification

Run small real swaps after funding a test wallet:

- one EVM route through each enabled fee-supporting provider,
- one LI.FI route after confirming portal fee routing.

Record whether the expected fee reached the configured treasury destination.
