import type { Metadata } from "next";
import Link from "next/link";
import { LegalOperatorDisclosure } from "@/components/LegalOperatorDisclosure";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms of use for Swap Assistant.",
  alternates: {
    canonical: "/terms"
  },
  openGraph: {
    title: "Swap Assistant Terms",
    description: "Terms for non-custodial swaps, alerts, and wallet-signed limit orders.",
    url: "/terms"
  }
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <h1>Terms of Use</h1>
        <p>
          Effective July 23, 2026. Limit Order Terms version 2026-07-17.1.
        </p>
        <p>
          These terms govern your use of Swap Assistant. By using the service,
          you agree to these terms, to use it only where lawful, and to review
          every wallet request before signing.
        </p>

        <section>
          <h2>Eligibility And Lawful Use</h2>
          <p>
            You must be at least 18 years old, have legal capacity to accept
            these terms, and be permitted to use the service where you are
            located. Availability of the website does not mean that its use is
            lawful in every country.
          </p>
          <p>
            Do not use Swap Assistant for unlawful activity, sanctions
            evasion, market abuse, fraud, or transactions involving blocked,
            sanctioned, stolen, or illicit assets or parties. You must not
            interfere with the service, bypass security or request limits, or
            use automated access without permission.
          </p>
        </section>

        <section>
          <h2>Non-Custodial Service</h2>
          <p>
            Swap Assistant provides quote comparison, saved history, favorites,
            alerts, and wallet-assisted swap execution. It does not custody
            funds, control wallet assets, store private keys or seed phrases,
            or sign ordinary swap transactions for you. You retain control of
            your wallet and decide whether to approve each wallet request.
          </p>
          <p>
            Swap Assistant can prepare transaction data or transmit an exact
            wallet-signed protocol order to a selected third-party service.
            Blockchain networks, wallet providers, protocols, solvers, and
            liquidity venues perform the resulting transaction or order fill.
            Swap Assistant is not the buyer, seller, custodian, or counterparty
            to your swap.
          </p>
        </section>

        <section>
          <h2>Third-Party Providers</h2>
          <p>
            Quotes, routes, token lists, wallet connection, notifications, and
            blockchain data can depend on third-party providers. Their
            availability, terms, security controls, rate limits, and output can
            change independently of Swap Assistant.
          </p>
          <p>
            Your use of a wallet, protocol, network, or route can also be
            governed by that provider&apos;s terms and privacy notice. Swap
            Assistant does not control third-party smart contracts, token
            contracts, liquidity, or transaction settlement.
          </p>
        </section>

        <section>
          <h2>Wallet And Token Safety</h2>
          <p>
            You control your wallet, balances, approvals, recovery details, and
            device security. Token names and symbols can be copied, so verify
            the network and contract address. Swap Assistant will never ask for
            a seed phrase or private key.
          </p>
        </section>

        <section>
          <h2>No Financial Advice</h2>
          <p>
            Swap Assistant does not provide investment, tax, legal, accounting, or
            financial advice. Alerts and quote comparisons are tools for your
            own review.
          </p>
        </section>

        <section>
          <h2>Fees</h2>
          <p>
            Quotes can include network costs, provider fees, and a disclosed
            Swap Assistant platform fee on supported routes. Review the trade
            summary and your wallet confirmation before signing. Fee behavior
            can differ by provider and route.
          </p>
          <p>
            Swap Assistant can receive different compensation from different
            providers. Available routes are ranked by the receiving amount
            returned for the user after disclosed service fees, and you remain
            free to choose another route before signing.
          </p>
          <p>
            A platform or integrator fee can be paid to the operator or shared
            with a provider. This creates a commercial interest in completed
            swaps. Routes are ranked by the estimated amount you receive after
            disclosed service fees, not by the compensation expected by the
            operator. Provider estimates can differ in completeness and are not
            guaranteed.
          </p>
        </section>

        <section>
          <h2>Risks</h2>
          <p>
            Blockchain transactions can be irreversible. Smart contracts, token
            contracts, bridges, liquidity venues, wallet apps, and networks can
            fail or behave unexpectedly. You are responsible for checking the
            transaction details shown by your wallet before signing.
          </p>
        </section>

        <section id="limit-orders">
          <h2>Limit Orders</h2>
          <p>
            A limit order authorizes a supported protocol to fill only the
            token, amount, minimum receive amount, recipient, network, and
            expiry contained in the order you sign. The signature does not give
            Swap Assistant your private key or permission to change those terms.
          </p>
          <p>
            Execution is not guaranteed and can fail because of liquidity,
            solver availability, gas costs, wallet balance, token allowance,
            expiry, network conditions, smart contracts, or provider
            availability. An order can fill at any time before expiry once its
            signed conditions are satisfied, including while you are away from
            the app.
          </p>
          <p>
            Token approval is a separate onchain permission and can remain in
            effect until used, replaced, or revoked. Cancellation is not final
            until the relevant protocol or blockchain confirms it; an order can
            fill while cancellation is pending. You are responsible for
            reviewing the wallet signature, keeping enough balance, monitoring
            open orders, and cancelling or revoking approvals when needed.
          </p>
        </section>

        <section>
          <h2>Taxes</h2>
          <p>
            You are responsible for determining and reporting taxes, duties,
            and records that apply to your transactions. Swap Assistant does
            not calculate or file them for you.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            Swap Assistant may be updated, paused, rate limited, or unavailable at
            any time. We may disable providers, chains, tokens, alerts, or
            features when needed for security, compliance, reliability, or
            provider availability.
          </p>
        </section>

        <section>
          <h2>Disclaimer</h2>
          <p>
            To the fullest extent permitted by law, Swap Assistant is provided
            on an &quot;as is&quot; and &quot;as available&quot; basis, without
            a guarantee of availability, accuracy, security, execution, price,
            profit, merchantability, non-infringement, or fitness for a
            particular purpose. You control whether to sign and bear the risks
            of the wallet, token, protocol, network, and transaction you choose.
          </p>
        </section>

        <section>
          <h2>Liability</h2>
          <p>
            To the fullest extent permitted by law, the operator will not be
            liable for indirect, incidental, special, consequential, punitive,
            or exemplary loss, or for lost profits, opportunities, data, or
            digital assets arising from use of the service or a third-party
            provider.
          </p>
          <p>
            To the fullest extent permitted by law, the operator&apos;s total
            aggregate liability arising from the service will not exceed the
            greater of USD 100 or the platform fees directly retained from your
            swaps during the 12 months before the event giving rise to the
            claim. Nothing in these terms excludes liability that applicable
            law does not permit to be excluded or limited.
          </p>
        </section>

        <section>
          <h2>Suspension And Termination</h2>
          <p>
            Access can be restricted or terminated when reasonably necessary
            for security, legal compliance, abuse prevention, provider
            requirements, or service protection. Terms that by their nature
            should continue, including risk, liability, dispute, and payment
            provisions, survive termination.
          </p>
        </section>

        <section>
          <h2>Governing Law And Disputes</h2>
          <p>
            These terms are governed by the applicable federal laws of the
            United Arab Emirates and the laws applicable in the Emirate of
            Dubai, without overriding mandatory rights that apply to you.
          </p>
          <p>
            Before starting formal proceedings, please use the contact address
            in the legal disclosure below and allow 30 days for an informal
            resolution. Subject to mandatory applicable law, the courts of
            Dubai have exclusive jurisdiction.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            These terms can be updated as the service changes. When a limit
            order requires new terms, the app will require you to review and
            accept the new version before storing that order.
          </p>
        </section>

        <LegalOperatorDisclosure />
      </div>
    </main>
  );
}
