import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy summary for The Wallet."
};

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/">
          Back to swap
        </Link>
        <h1>Privacy</h1>
        <p>
          The Wallet stores the minimum product data needed for wallet-owned
          history, favorites, alerts, and notification preferences.
        </p>

        <section>
          <h2>Data We Store</h2>
          <p>
            We can store wallet addresses, wallet-auth sessions, swap history,
            favorite pairs, alert thresholds, notification preferences, Telegram
            link status, and operational logs needed to run the service.
          </p>
        </section>

        <section>
          <h2>Data We Do Not Store</h2>
          <p>
            We do not store seed phrases, private keys, raw wallet signing
            material, or custody credentials. Wallet signatures are used for
            authentication only.
          </p>
        </section>

        <section>
          <h2>Third Parties</h2>
          <p>
            The app may interact with wallet connection providers, swap
            aggregators, blockchain RPC services, price data providers,
            Telegram, email delivery providers, hosting platforms, and monitoring
            services. These providers can receive technical request data needed
            to process quotes, transactions, alerts, or service health checks.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            Provider keys and backend credentials are kept server-side. Public
            wallet addresses and onchain transaction data may still be visible
            on public block explorers because blockchain activity is public by
            design.
          </p>
        </section>
      </div>
    </main>
  );
}
