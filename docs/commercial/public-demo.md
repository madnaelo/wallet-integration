# Public Sales And Synthetic Demo

- Selling page: `/business` (indexable, canonical, sitemap).
- Demonstration: `/demo` (noindex, clearly synthetic).
- CTA: `/contact?enquiry=branded-demo` or `paid-pilot`. Only these allowlisted
  values prefill Partnership and a fixed prompt; arbitrary query text is ignored.
- Price: [pilot-offer.md](pilot-offer.md), one internal source.

## Boundary

This is an isolated synthetic route in the existing deployment, NOT a change to
the live `/swap` environment. It uses no provider/customer credentials or treasury,
and does not read live revenue configuration. `DEMO_POLICY` fixes all execution,
signing and revenue capabilities false. Fixture assets are non-address identifiers.
There is no API endpoint for demo orders, quotes, history, fees or alerts.

The client reuses TokenPicker, unit conversion and the existing mock quote builder.
It exposes display fields only: no transaction calldata, allowance, recipient
address, quote evidence ID or transaction hash. Activity/preferences are ephemeral
React state. Sample completion is never submitted to the trusted revenue ledger.

`preflight:demo` checks the runtime import closure for approved modules and rejects
wallet, network and environment access. `/demo` adds CSP `connect-src 'none'`,
`frame-src 'none'`, `worker-src 'none'`; PWA registration/install is skipped there.
Navigation uses ordinary links to leave the isolated surface. The existing live
application and its provider/regulatory/treasury settings are not activated or
weakened. This demo does not claim commercial/regulatory clearance.

## Verification And Release

Run `npm run preflight:demo`, `npm run test:preflight`, frontend unit/type/lint/build,
Playwright, backend/database/SpotBugs checks using the existing verify script.
`e2e/commercial.spec.ts` checks both desktop/mobile, no demo API traffic or wallet
access, preview/history/alerts, layout, CSP/noindex and commercial contact flow.
Contact submission in acceptance tests is mocked; it is not email delivery proof.

Deploy through master CI/Security/Release Production into the existing Wallet
project only. Do not replace shared proxy configs or other projects' resources.
For a customer deployment use [customer-delivery.md](customer-delivery.md) and the
existing production preflight with separate approved accounts/resources.

After deployment, check `/business`, `/demo`, CTA and contact acceptance; confirm
admin/revenue remains protected/noindex. Do not demonstrate private revenue data.
No seed phrase, real wallet signature, funds, new provider or license change is
required for this public demo.

## Enquiry Handling

The existing contact service stores enquiries transactionally and can queue an
operator email only when email delivery and a contact recipient are configured.
The saved production configuration currently has neither SMTP credentials nor
a contact recipient; do not claim automated email forwarding is verified.
Review the protected contact inbox daily using the existing commands in
[CI/CD operations](../ci-cd.md), reply personally by email, and mark each message
reviewed/resolved. Do not paste the admin key into the public demo or tracker.
No prospect outreach has been sent as part of this implementation.
