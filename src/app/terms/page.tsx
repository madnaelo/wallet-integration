import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for Swap Assistant."
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <h1>Terms</h1>
        <p>
          Effective July 17, 2026. Limit Order Terms version 2026-07-17.1.
        </p>
        <p>
          These terms describe the expected use of Swap Assistant. By using the
          app, you agree to use it only where lawful and to review every wallet
          request before signing.
        </p>

        <section>
          <h2>Non-Custodial Service</h2>
          <p>
            Swap Assistant provides quote comparison, saved history, favorites,
            alerts, and wallet-assisted swap execution. It does not custody
            funds, store private keys, or sign transactions for you.
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
          <h2>Availability</h2>
          <p>
            Swap Assistant may be updated, paused, rate limited, or unavailable at
            any time. We may disable providers, chains, tokens, alerts, or
            features when needed for security, compliance, reliability, or
            provider availability.
          </p>
        </section>
      </div>
    </main>
  );
}
