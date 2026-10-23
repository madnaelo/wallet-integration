# Fictional Brand Setup And Demonstration Evidence

Prepared October 24, 2026. **Synthetic evidence, not a customer installation.**
River Wallet is a fictional label. No provider, wallet, exchange or customer was
connected. No quote, order, transaction, fee, enquiry or email was submitted.

**Capture status:** the fictional-name build and SSR tests pass, but its local
interactive capture is pending because the tool rejected starting the preview
server. The three reference screenshots below are from CI with the **default Swap
Assistant brand**, not River Wallet. Do not represent them as fictional-brand
browser verification. The owner-started local preview is the remaining capture step.

## Manual Preparation

Used the existing single-deployment brand configuration, not a new provisioning
system. A tracked-source snapshot in the ignored local preview directory excluded
real environment files and Git history. It reused already-installed dependencies.
Only these non-secret example settings were supplied for the local build:

```text
NEXT_PUBLIC_BRAND_NAME=River Wallet - Fictional Demo
NEXT_PUBLIC_BRAND_SHORT_NAME=River Demo
NEXT_PUBLIC_OPERATOR_DISCLOSURE=Fictional local demonstration. No customer deployment.
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4318
NEXT_PUBLIC_BACKEND_BASE_URL=/backend
BACKEND_PROXY_TARGET=https://backend.invalid
NEXT_TELEMETRY_DISABLED=1
```

The invalid backend hostname is intentional; this demonstration requires no
backend. Nothing was written to the real production/development configuration.
The existing local icon remains an application placeholder, not a customer's
licensed asset. No logo service, remote image or paid design tool was used.

One real branding defect surfaced: the demo heading hard-coded Swap Assistant,
while its surrounding navigation already used the shared brand. The review branch
passes the validated server-side brand name as a plain string to the demo. It does
not import environment/provider configuration into the isolated demo client.
The default production brand is unchanged. This is not a complete branding audit.

## Three Screenshots

These are captured from the actual CI synthetic application, not fabricated
interface artwork. The demonstration warning stays visible. They illustrate
assessment evidence; they are not proof of real wallet compatibility or settlement.

1. [Pair and costs](images/01-pair-and-costs.png): 100 sample USDC to ETH,
   illustrative net output, fee and minimum; gas explicitly not included.
2. [Approval boundary](images/02-approval-boundary.png): the sample review explains
   that real approvals would belong in a wallet. Completing this preview signs
   nothing and sends nothing.
3. [Ephemeral activity](images/03-ephemeral-activity.png): one row marked Preview
   only. Reload removes it; it is not persisted history or a blockchain receipt.

Captured by the 1280 x 960 viewport test in [CI run 40020145154](https://github.com/madnaelo/wallet-integration/actions/runs/40020145154)
at source head `f86e8f7ff6dcef42ba2d5a33a14dc13c05883787` (PR merge ref
`0617b242dfee4c644f7be7a30a9164839e08638f`). These are full-page captures,
not 4:3 gallery crops. The companion 390 x 844 mobile test passed too.
Read the [verification receipt](verification.md) for network/storage assertions.
Original desktop/mobile captures are retained as CI artifacts and an ignored local
copy. No screenshot contains credentials, a real address or a real enquiry.

**Marketplace boundary:** these screenshots are prepared for owner review, not
approved gallery assets. The app includes site-navigation/contact labels and
technical detail that may not suit a marketplace gallery. Review composition,
readability, branding and current platform rules before uploading. No upload,
remote draft or publication occurred. Do not remove the synthetic disclaimer to
make an image appear to show a customer deployment.

## Short Walkthrough Script

Proposed approximately 60-second explanation, not a recorded/promised delivery:

| Time | Show | Narration |
| --- | --- | --- |
| 0-8 s | Fictional name and demonstration banner | "This is River Wallet, a fictional example. These prices and this wallet are samples; no funds move." |
| 8-20 s | USDC-to-ETH inputs and summary | "An assessment maps your entry, pair, amount and review. Here 100 sample USDC produces 0.03992 sample ETH after the sample service fee. Gas is not included. This is not a live executable quote." |
| 20-30 s | Sample wallet, then Review sample quote | "The product keeps review separate from approval. A real user would approve in their own wallet. This preview does not open or sign with a wallet." |
| 30-38 s | Complete preview, then Activity | "This row is explicitly preview-only and disappears on reload. It does not prove settlement, fee receipt or compatibility with your connector." |
| 38-52 s | Sample assessment: decision and requirement classification | "The deliverable is the analysis: what can be reused, what needs configuration, and what is custom or unverified. This example does not have a drop-in SDK or a customer completion callback." |
| 52-60 s | Assessment acceptance matrix and decision | "We finish with prerequisites, acceptance evidence and a recommendation. A provider widget or custom integration may fit better. Production work would need a separate agreed scope." |

Use the [sample report](sample-assessment.md) beside the demo. Do not add a revenue,
customer, provider approval or legal-clearance claim to the narration. A future
marketplace video needs its own approved gallery/format review; none was produced.

## Reproduce The Checks

Build only an isolated source snapshot with the settings above, then run its
production server bound to `127.0.0.1:4318`. Do not reuse production secrets.
Against that local server, from the repository root:

```powershell
$env:PLAYWRIGHT_TEST_BASE_URL = 'http://127.0.0.1:4318'
$env:PLAYWRIGHT_DEMO_BRAND = 'River Wallet - Fictional Demo'
npm.cmd run test:e2e -- e2e/first-customer-demo.spec.ts --workers=1
```

The test blocks unexpected API/backend/fetch/XHR/external requests, records any
WebSocket, makes wallet access throw, checks `connect-src 'none'` and noindex,
and verifies preview arithmetic and reload-cleared state. Only same-origin static
resources and document navigation are permitted. The source dependency preflight
adds an independent check against importing live modules.

No customer source handover artifact is produced. The ignored preview tree is not
a distributable archive; a future handover must separately review assets/licenses,
exclude secrets and operational records, and use the existing delivery checklist.
