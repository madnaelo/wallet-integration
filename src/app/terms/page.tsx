import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for The Wallet."
};

export default function TermsPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/">
          Back to swap
        </Link>
        <h1>Terms</h1>
        <p>
          These terms describe the expected use of The Wallet. By using the
          app, you agree to use it only where lawful and to review every wallet
          request before signing.
        </p>

        <section>
          <h2>Non-Custodial Service</h2>
          <p>
            The Wallet provides quote comparison, saved history, favorites,
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
            change independently of The Wallet.
          </p>
        </section>

        <section>
          <h2>No Financial Advice</h2>
          <p>
            The Wallet does not provide investment, tax, legal, accounting, or
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

        <section>
          <h2>Availability</h2>
          <p>
            The Wallet may be updated, paused, rate limited, or unavailable at
            any time. We may disable providers, chains, tokens, alerts, or
            features when needed for security, compliance, reliability, or
            provider availability.
          </p>
        </section>
      </div>
    </main>
  );
}
