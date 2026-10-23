# River Wallet: Illustrative Integration Assessment

**FICTIONAL TEAM / SYNTHETIC EXAMPLE / NOT A CUSTOMER DEPLOYMENT**

Report RW-01, October 24, 2026. Implementation baseline
`433b98fa683f13f8f21024219f0520239e022984`, plus the demo-heading-only fix in this
review branch. No River Wallet company, operator, connector or provider account
has been verified. The name is a fictional label, not a registered brand claim.

## Decision

**Conditional fit for a separately branded linked web deployment; do not promise
a drop-in embedded wallet SDK.** Reuse Swap Assistant if this team needs its own
quote-review, history and alert journey and accepts operating an isolated backend.
A simple provider widget deserves preference if the actual need is only a small
swap panel without these saved/operational features. Commission custom work if
seamless existing-wallet sessions, a native SDK or a completion callback is essential.

For this example, proceed only to a scoped technical pilot after the acceptance
owner accepts a separate wallet connection and explicitly resolves return
navigation. No live provider activation or production go-live is recommended by
this report alone. The assessment remains useful even if the buyer chooses a widget.

## Fictional Brief And Assumptions

River Wallet wants a Swap entry from a responsive web wallet. Its hypothetical
operator wants one Ethereum USDC-to-ETH journey, editable amount, recipient review,
ordinary wallet approval, saved history, and a way back to its product. The example
assumes the buyer can supply an authorized connector specification, isolated cloud
accounts and an eligible provider account. None has actually been supplied.

Scope excludes native SDK embedding, auto-execution, cross-chain settlement,
Bitcoin, fiat, custody, liquidity, public live Radar and bespoke smart contracts.
These exclusions bound this assessment, not a claim the core lacks every such module.

## Journey And Responsibility Map

| Stage | Proposed experience | Actual boundary / owner |
| --- | --- | --- |
| Entry | River product opens its proposed branded `/swap` origin with pair/amount | Customer owns entry navigation. Existing parser accepts `chainId`, `toChainId`, `sellToken`, `buyToken`, `sellAmountRaw`; not `returnUrl`. SA01 |
| Connect | User selects a compatible wallet on the swap origin | Existing AppKit/WalletBridge flow. A connection on River's different origin is not automatically shared. Specific connector/mobile return is unverified. SA02 |
| Quote | User requests current route for reviewed account, recipient and amount | Next.js validates origin, rate budget, inputs, configured assets/providers; credentials stay on server. Route availability remains external. SA03 |
| Review | Show net received, minimum received, separately denominated fees/gas | Provider amounts are normalized; fees encoded in the output must not be deducted again. Slippage is a bound, not a charged fee. SA04 |
| Approve | User approves required allowance and swap in wallet | Neither connection nor history sign-in grants spending approval. Rejection is not submission; allowance and swap are distinct. SA02 |
| Track | Show chain/route progress; optionally sign in to store history | Spring Boot/PostgreSQL store authenticated history. Independent revenue reconciliation is distinct from browser confirmation. SA05 |
| Return | User can manually navigate back; a designed return action is separately scoped | No customer completion callback or cross-origin result contract exists in the inspected parser. A navigation event cannot prove settlement. SA01 |

Server responsibilities are shared between Next.js quote handling and Spring Boot
application persistence/notifications; do not sell this as frontend-only. Providers
build available routes; chains supply settlement evidence. Customer retains its
operator, accounts, support, deployment and acceptance responsibilities.

## Concrete Inputs And Expected Display

Source-backed input convention: Ethereum chain ID `1`, 100 USDC with six decimals
becomes `sellAmountRaw=100000000`. A real link must use the customer-reviewed token
catalogue identifier, not a ticker guessed from its name. No executable URL with
guessed contracts is supplied. These query fields prefill inputs, not authorization.

**Synthetic demo fixture only:** choose `demo:usdc` -> `demo:eth`, amount `100`,
slippage `50` BPS. At the fixed fixture price 2,500 USDC/ETH, route A displays:

- Gross illustrative amount: 0.04 ETH.
- Sample destination service fee: 0.00008 ETH (20 BPS of that fixture gross).
- Net illustrative received: 0.03992 ETH.
- Illustrative minimum: 0.0397204 ETH (0.03992 x 0.995).
- Gas: explicitly not included. No wallet, hash, order, settlement or fee receipt.

Route A raw display values: output `39920000000000000`, minimum
`39720400000000000`, fee `80000000000000`. Completing preview creates one
ephemeral Activity row and resets review. Reload clears it. This is **not** the
production 0x source-fee formula; the demo's sample fee is destination-denominated.
No hypothetical no-fee live output is reconstructed from a source fee. SA04/SA06.

## Requirement Classification

| River requirement | Classification | Assessment result |
| --- | --- | --- |
| Token/amount/recipient review and ordinary approval guidance | Existing application capability | Reuse subject to supported route and connector acceptance |
| Branded web/PWA metadata, name, assets and support | Configuration | Shared brand contract; build/review each surface. Demo heading fix removes one hard-coded name; does not certify all branding |
| Own domains, API accounts, treasury, DB, notifications | Configuration with external prerequisites | Preflight rejects unsafe/isolation conflicts; does not provision or approve accounts |
| Same wallet already connected on another origin | Custom/unknown | No shared-session promise; get actual wallet connector contract |
| Return button or machine-readable completion callback | Custom | Explicit navigation/result security contract needed; not in linked parser |
| Guaranteed support for every token/wallet | Unsupported promise | Provider route and wallet method availability cannot be assumed |
| Licensing transfers seller's provider entitlements | Unsupported | Buyer must have its own approved accounts/rights |
| Independent audit, legal clearance, guaranteed income | Excluded | Neither the source nor this report proves these |

## Prerequisites And Decision Blockers

| Evidence needed | Who supplies it | Consequence if absent |
| --- | --- | --- |
| Actual operator, markets, contracting/work permissions | Buyer and seller with appropriate advice | No signed commercial/live operating commitment |
| Connector methods, origin model and target wallet/browser matrix | Buyer engineering | No compatibility or seamless-return assertion |
| Approved provider plan/terms and wallet-connection project | Buyer | No live quote/transaction acceptance; never copy seller credentials |
| Verified chain/catalogue/recipient/treasury identifiers | Buyer + technical reviewer | No production config approval |
| Accepted return UX or separately scoped callback | Buyer product/engineering | Linked journey remains incomplete for seamless-embed requirement |
| Dependency, asset and source-license rights | Seller + buyer review | No source/brand handover until scope and notices are agreed |

Current repository policy allows fee mechanisms only for 0x and LI.FI and keeps
1inch/Velora/Odos blocked. That is not transferable account approval or proof of
the individual operator's eligibility. LI.FI operator eligibility and legal review
remain separate unresolved matters in existing records. This example need not use
LI.FI; it does not enable any provider. SA07.

## Acceptance Evidence Matrix

Reuse the authoritative [wallet-journey checklist](https://getswapradar.xyz/guides/add-swaps-to-a-wallet#acceptance-checklist)
and [delivery checklist](../customer-delivery.md), rather than adding a competing
general checklist. This table binds those cases to the fictional requirements.

| Case | Input/action and required evidence | Current evidence classification |
| --- | --- | --- |
| Entry + return | 100 USDC raw amount/pair survive entry; return doesn't imply completion | Source inspected; actual River origin/return unverified |
| Quote + review | Synthetic fixture above; one fee deduction and explicit gas unknown | Existing fixture mechanism + current isolated demo tests; no live quote |
| Account switch | A -> B invalidates the old owner's review; screenshot + no stale submission | Required customer test, not executed against a real wallet here |
| User rejection | Reject allowance/swap; no invented hash; editable inputs remain | Required customer test, not claimed by preview completion |
| Expiry | Old route not automatically retried; fresh route requires review | Required customer test; sample fixture is not an expiring provider quote |
| Partial approval | Allowance succeeded, swap rejected; no implied allowance revocation | Required customer test |
| Provider unavailable | Mock 429/no route; unavailable state, bounded fallback, no synthetic executable route | Provider policy/fallback source exists; real account unverified |
| Duplicate transaction | Same chain/hash counted once; distinct finalized transfers separately verified | Existing revenue tests are repository evidence, not a River payout test |
| Cross-chain delay | Source receipt != destination delivery | Existing checklist; deliberately outside this same-chain pilot |
| Branding + privacy | Fictional name, no network/API/wallet/storage activity in demo | Fictional-name SSR/build checks; default-brand CI screenshots/network guards passed. Fictional-brand browser capture pending; see verification receipt |
| Contact and handover | Mock form acceptance; reviewed docs/isolated target manifest | No customer enquiry/email/deployment created by this assessment |

Unexecuted cases remain required acceptance work, not green checkmarks. There has
been no real transaction, compatible connector certification or customer UAT.

## Proposed Pilot And Handover, Only If Fit Is Confirmed

Use the existing [pilot SOW](../pilot-sow-template.md) and
[pilot pricing](../pilot-offer.md), not new delivery commitments here. Candidate
scope: one customer-owned branded web deployment, Ethereum USDC-to-ETH review,
ordinary compatible-wallet approval, optional signed-in history, named operator
and support owner. A return callback is excluded unless separately agreed.

Deliverables would include an exact source revision/dependency notice inventory,
sanitized configuration inventory, isolated target manifest/preflight result,
desktop/mobile acceptance report with unresolved cases, build/run/release/rollback
instructions, backup/restore evidence and access handover. These are future pilot
deliverables, not operations performed for River. Source artifact review excludes
secrets, operational exports, private Git history and unlicensed assets.

Final decision for the example: **proceed to fit clarification, not production**.
If separate origin/wallet connection is unacceptable and a callback is mandatory,
choose custom integration evaluation instead of describing the reusable deployment
as turnkey. A widget may be sufficient if saved history/alerts are dropped; exact
widget compatibility and commercial terms still need their own review. Reuse the
[existing comparison](https://getswapradar.xyz/guides/build-vs-license-crypto-swaps).

## Claim-To-Source Register

Paths relative to the baseline above; symbols are stable references. No private
operational evidence is included. The verification receipt distinguishes current
executed tests from source inspection and historical CI.

| ID | Mechanism and limit | Source |
| --- | --- | --- |
| SA01 | Bounded pair/amount parser; no returnUrl/result callback in interface | `src/app/swap/page.tsx:4263-4364`, `parseSwapLinkParams`, `resolveSwapLinkForUi`, `buildSwapLinkHref` |
| SA02 | Wallet connection and separate backend session/signing | `src/components/WalletBridge.tsx`, `WalletBridge`; `src/app/swap/page.tsx`, `ensureBackendSession`; `src/lib/walletConnector.ts` |
| SA03 | Request checks, server provider selection and signed quote evidence | `src/app/api/quote/route.ts`, `GET`; `src/lib/server/quoteRequestValidation.ts`; `src/lib/server/multiQuoteProvider.ts` |
| SA04 | Net provider output, denomination-aware disclosures and warning | `src/lib/server/quoteNormalization.ts`, `normalizeQuote`; `src/components/FeeDisclosure.tsx`, `DestinationFeeOutput`/`FeeEquivalent`; `src/lib/quoteWarnings.ts` |
| SA05 | Authenticated history and independent settlement ledger | `backend/src/main/java/com/wallet/swap/history/SwapHistoryService.java`; `revenue/RevenueService.java`; `revenue/RevenueSettlementVerifier.java` (under same Java package root) |
| SA06 | Synthetic identifiers/fixed fixture pricing, ephemeral preview only | `src/lib/demo.ts`, `demoQuotes`, `DEMO_POLICY`; `src/app/demo/DemoExperience.tsx`, `preview`; `scripts/demo-preflight.mjs`; `next.config.mjs` demo headers |
| SA07 | Provider allowlist is fee policy, not legal/account eligibility | `config/provider-commercial-policy.json`; `src/lib/server/providerCommercialPolicy.ts`, `resolveSwapProviderPolicy`; `docs/legal/production-legal-review.md` |
| SA08 | Single-deployment brand validation and isolated preflight | `src/lib/brand.ts`, `createBrand`; `scripts/deployment-preflight.mjs`; `docs/commercial/branding-and-preflight.md` |
| SA09 | Scoped commercial/handover boundaries | `docs/commercial/pilot-offer.md`, `pilot-sow-template.md`, `customer-delivery.md`; `src/lib/growthContent.ts`, existing wallet acceptance checklist/comparison |
