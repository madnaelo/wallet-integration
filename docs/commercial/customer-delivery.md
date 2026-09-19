# Customer Delivery Checklist

This checklist is for a separately licensed deployment, not multi-tenancy and
not a clone of production secrets. Items below are acceptance requirements;
they are not a claim that customer provisioning is already automated.

## Isolation And Ownership

- Assign a customer-owned repository/deployment target, domains and operator.
  Never repoint this repository's production project IDs or existing master
  release workflow to a customer account.
- Use a separate database, backup destination, Redis prefix/instance, deployment
  project, SSH/deploy identity, monitoring and notification configuration.
- Generate fresh admin/auth peppers, database passwords and push VAPID keys.
  Create the customer's own wallet-connection project and origin allowlist.
- The customer supplies provider accounts/API keys and controls payout wallets.
  Do not copy Aqeel's keys, integrator identity, API entitlements or fee recipient.
  Provider/operator approvals are not transferable just because code is licensed.
- Set frontend URL, backend CORS, signing domain/URI, cookies, notification links
  and canonical URLs consistently. Verify no link returns to Aqeel's deployment.

## Branding And Legal Copy

Before calling a deployment white-label, cover web headings/copy, wallet
connection metadata, auth signature text, PWA name/icons, notification titles and
bodies, metadata/social images, contact messages, fee label and support destination.
The current product has hard-coded branding in these surfaces; changing a header
alone does not satisfy this checklist.

The buyer must provide its real operator details, privacy/contact routing and
applicable terms. Never publish Aqeel's individual operator disclosure as the
buyer's, invent incorporation, or imply licensed status. Custom branding must not
modify provider policy, fee recipient or trusted execution constraints in browser
state. Keep the server as the authority for those settings.

## Acceptance

1. Record the source revision, dependency inventory and third-party notices.
   Exclude production `.env` files, operational exports, personal regulatory/email
   correspondence, private customer information and the full private Git history
   from any source handover. Review the actual delivery artifact before sending it.
2. Run unit tests, typecheck, lint, production build, backend verification and
   isolated browser tests. Retain outputs with the delivered version.
3. Test a fresh wallet connection/sign-in, recipient selection, preview quote,
   saved history, preferences, favorite alert and authorized admin boundary.
   Use synthetic data and mocked providers where appropriate.
4. Verify provider-policy enforcement, explicit platform-fee disclosure, missing
   configuration failures and healthy-provider fallback. No client may choose the
   fee treasury or activate an unresolved provider.
5. Restore a test backup into an isolated database. Confirm least-privilege
   access, monitoring, incident ownership, update/rollback procedure and costs.
6. Only after operator/provider eligibility is resolved, have the owner approve
   a deliberately small real transaction. Follow the existing
   [earning checklist](../earning-setup-finalization.md); do not equate a quote,
   dry run, history entry or successful source transaction with a fee payout.
7. Document residual limitations and obtain acceptance against the written scope.

## Who Pays And Who Signs

Customer infrastructure, provider subscriptions if needed, domains and transaction
gas are customer costs, not promised to be free. We do not enter payment details,
hold customer funds, import wallet secrets or sign their transactions. A scoped
setup service may configure public receive addresses with explicit confirmation.

## Existing Local Commands

From the repository root, with the existing dependencies/toolchain installed:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Backend verification on this Windows workspace (uses the existing Java/cache
helpers, not a second toolchain installation):

```powershell
. ./scripts/dev-toolchain.ps1
Initialize-ProjectDependencyCaches -RepoRoot (Get-Location).Path
Initialize-ProjectJava17
& (Get-ProjectMavenExecutable) "-Dmaven.repo.local=$env:MAVEN_REPO_LOCAL" -f backend/pom.xml verify
```

For startup and platform-specific deployment steps, reuse
[local and deployment documentation](../local-and-deployment.md); do not maintain
a second copied release pipeline. The source repository currently releases
production from `master`; customer pipelines must target only their own resources.
