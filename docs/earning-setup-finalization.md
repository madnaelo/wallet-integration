# Earning Setup Finalization

Last reviewed: May 27, 2026

This checklist tracks what is required before The Wallet can reliably collect
platform fees in production.

## Current Status

- Production frontend is live on Vercel.
- Production backend health is live on OCI.
- The quote route has provider-side fee parameters wired for 0x, 1inch,
  Velora/ParaSwap, Odos, and LI.FI.
- Vercel production environment variable names exist for provider keys, fee
  addresses, CORS, and cache/rate-limit settings.
- LI.FI Partner Portal fee collection is enabled for integration `the-wallet`
  with default EVM, Solana/SVM, Sui, and Bitcoin receiving wallets.
- Current EVM launch networks are Ethereum, Arbitrum, Optimism, Base, Polygon,
  BNB Smart Chain, and Avalanche.
- `PARASWAP_API_KEY` is still missing.
- Treasury receive addresses have been provided. Keep the actual values in
  deployment/provider configuration, not in committed docs, and verify them with
  small real swaps before relying on revenue collection.

## Fee Address Model

Use one treasury EVM address for the first production release:

- `FEE_RECIPIENT_ADDRESS`: the wallet intended to receive direct platform fees.
- `AFFILIATE_ADDRESS`: fallback/legacy partner wallet address.

For MVP production, set both variables to the same treasury EVM address. The
code prefers `FEE_RECIPIENT_ADDRESS` and falls back to `AFFILIATE_ADDRESS` only
when the fee recipient is blank.

The treasury address must:

- Start with `0x`.
- Be controlled by us, not an exchange deposit address.
- Be usable across Ethereum, Arbitrum, Optimism, Base, Polygon, BNB Smart Chain,
  and Avalanche.
- Be safe to receive many ERC-20 fee tokens.

Recommended path:

1. Use a dedicated treasury EOA for the MVP if speed matters.
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

Status: code wired.

The 0x quote client sends:

- `swapFeeRecipient`
- `swapFeeBps`
- `swapFeeToken`

Action remaining:

- Set the final EVM treasury wallet.
- Run a small real swap and verify the fee reaches the treasury.
- Monitor 0x dashboard analytics.

Reference:

- https://docs.0x.org/docs/0x-swap-api/guides/monetize-your-app-using-swap

### 1inch

Status: code wired, compliance review needed.

The 1inch quote client sends:

- `fee`
- `referrer`
- `origin`

Action remaining:

- Confirm our 1inch API account is allowed for commercial/fee-collecting use.
- Complete 1inch due diligence truthfully. Do not submit as personal
  non-commercial if the app is taking platform fees.
- Run a small real swap and verify fee behavior.

Reference:

- https://business.1inch.com/portal/documentation/apis/swap/swap
- https://business.1inch.com/portal/documentation/apis/swap/classic-swap/methods/v6.1/1/swap/method/get

### Velora / ParaSwap

Status: code wired, API key pending.

The Velora/ParaSwap client sends:

- `partner`
- `partnerFeeBps`
- `partnerAddress`
- `takeSurplus=true`
- `isDirectFeeTransfer=true`
- `includeContractMethods=simpleSwap,multiSwap,megaSwap` when fee or
  swap-and-transfer behavior is needed.

Action remaining:

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

Status: code wired, provider-side monetization enablement needed.

The Odos client sends:

- `partnerFeePercent`
- `feeRecipient`

Odos documents an automatic 80% partner / 20% Odos split for delegated fees,
but their pricing page also says monetization must be configured by the Odos
team.

Action remaining:

- Confirm our Odos API plan/key has swap monetization enabled.
- Contact Odos if it is not enabled.
- Run a small real swap and verify fee behavior.

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
- Verify fee receipt on every enabled EVM chain, not only Ethereum.
- Rotate the Telegram bot token because the old token was pasted in chat.
- Confirm `PARASWAP_API_KEY`, or document that ParaSwap is running without a
  private key and can hit public rate limits.
- Confirm 1inch commercial/API terms fit a revenue-generating app.
- Confirm Odos monetization is enabled provider-side.
- Run a small LI.FI route and confirm the fee appears under Collectable Fees.
- Add public fee disclosure in the product/legal copy.
- Add clear alert wording that notifications are estimates, not financial
  advice.
- Add terms/privacy pages before a public launch.
- Verify CORS origins after the final custom domain is attached.
- Set up automated DB backups for OCI PostgreSQL.
- Set up uptime/error alerts for Vercel and OCI.
- Monitor `/api/health` and `/api/admin/ops/summary` after each deployment.
- Run small real swaps through each provider and record the fee receipt result.

## Remaining Owner Actions

### Telegram token rotation

Needed because the old Telegram bot token was exposed in chat.

Steps:

1. Open Telegram.
2. Search for `BotFather`.
3. Send `/mybots`.
4. Select the bot used for The Wallet.
5. Choose API Token.
6. Revoke or regenerate the token.
7. Update production OCI and local development env files with the new token.

### Fee receipt verification

Run small real swaps after funding a test wallet:

- one EVM route through each enabled fee-supporting provider,
- one LI.FI route after confirming portal fee routing,
- one ParaSwap/Velora route after API-key or partner-access status is resolved.

Record whether the expected fee reached the configured treasury destination.
