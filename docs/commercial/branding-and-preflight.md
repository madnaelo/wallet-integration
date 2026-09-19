# Branding And Deployment Preflight

## Single-Deployment Brand Contract

The same code can be configured as a separately licensed installation; it is not
a multi-tenant service. The existing default identity and provider policy remain
unchanged.

| Setting | Purpose |
| --- | --- |
| NEXT_PUBLIC_BRAND_NAME | Web, wallet metadata, PWA and backend message name; default Swap Assistant. |
| NEXT_PUBLIC_BRAND_SHORT_NAME | PWA short name, defaults to the full name. |
| NEXT_PUBLIC_BRAND_ASSETS_BASE | Same-origin public asset directory, e.g. /brands/river. |
| NEXT_PUBLIC_BRAND_SUPPORT_PATH | Same-origin support page, default /contact. |
| NEXT_PUBLIC_OPERATOR_DISCLOSURE | Required plain-text disclosure for a different brand. |

Names allow 1-40 plain-text ASCII characters. Asset/support paths cannot use
remote origins, query strings or traversal. Place favicon.ico, favicon.svg,
apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-512.png and
og-image.png in the configured asset directory. Supply the configured support
page and review all legal/contact routing for the actual operator.

Next.js public values are build-time configuration. Rebuild the frontend and set
the same brand name on the backend; changing only a runtime frontend variable
does not rebrand an existing bundle. Docker build arguments and Compose runtime
settings forward these values. Backend signature prompts and notification/contact
messages use the same brand name. No brand setting can change treasury, fee rate,
provider eligibility or execution authorization in browser state.

## Read-Only Preflight

Prepare a reviewed target JSON using
`config/customer-deployment.example.json` as a structural example. It is
deliberately incomplete and does not authorize an actual customer account.

Export the deployment's environment from the appropriate secret store into the
current process without printing it. Run from the repository root:

```powershell
npm.cmd run preflight:deployment -- --manifest path/to/reviewed-target.json --protected path/to/protected-deployments.json
```

The protected file is a JSON array of existing deployment manifests. It contains
target identifiers/origins, not credentials. Customer mode requires this baseline
and rejects reuse of protected repository, project, directory, containers, volume,
network, database, Redis prefix or origins. Shared Vercel organization and branch
names are allowed; sharing a deployment project is not.

The command checks reviewed environment/target agreement, separate HTTPS origins,
first-party cookie proxy, CORS/signing URLs, dedicated credentials, database
routing, distributed rate limits, wallet-connection ID, approved monetized
providers, treasury, revenue capture/RPC configuration and brand/support assets.
It reports setting names only, never secret values. It reads local configuration;
it does not log into clouds, verify account ownership, create resources or deploy.

For each target field in the JSON, the corresponding env variable is explicit in
`targetBindings` in `scripts/deployment-preflight.mjs`. CI tests the validator
with a fictional River Swap deployment and negative isolation/security cases.
Run the preflight before a real customer release; it is not an automatic
customer-provisioning system or a replacement for reviewing provider accounts.

## Release Boundaries

The owner's production workflows still release from master. This feature branch
runs CI without repointing production or other applications. Never reuse owner
secrets or replace existing project IDs to serve a customer. Copy reviewed code
into an isolated licensed deployment only after the customer-delivery checklist
is satisfied. No multi-tenancy, subscription billing or automatic infrastructure
provisioning was added.

Technical preflight is neither legal clearance nor proof of fee payout. Real
operator identity, provider eligibility, contracts, support ownership and the
owner-approved real-payout test remain independent gates.
