import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy summary for Swap Assistant.",
  alternates: {
    canonical: "/privacy"
  },
  openGraph: {
    title: "Swap Assistant Privacy",
    description: "How Swap Assistant handles wallet addresses, saved activity, alerts, and notification details.",
    url: "/privacy"
  }
};

export default function PrivacyPage() {
  return (
    <main className="legalPage">
      <div className="legalShell">
        <Link className="legalBackLink" href="/swap">
          Back to swap
        </Link>
        <h1>Privacy</h1>
        <p>Effective July 17, 2026.</p>
        <p>
          Swap Assistant stores the minimum product data needed for your swap
          history, favorites, alerts, and notification preferences.
        </p>

        <section>
          <h2>Data We Store</h2>
          <p>
            We can store wallet addresses, wallet-auth sessions, swap history,
            favorite pairs, alert thresholds, notification preferences,
            Telegram chat identifiers, email settings, push-subscription
            endpoints and encryption keys, and operational records needed to
            secure and run the service.
          </p>
          <p>
            For a limit order, we store the provider-verifiable signed order
            payload, its signature and hashes, the accepted terms version, and
            order status. This is necessary to submit, reconcile, and cancel
            the exact order you authorized.
          </p>
        </section>

        <section>
          <h2>Data We Do Not Store</h2>
          <p>
            We do not store seed phrases, private keys, wallet passwords, or
            custody credentials. A wallet sign-in signature is verified and is
            not stored. A limit-order signature is different: it is stored
            because the selected order protocol needs it to verify and fill the
            exact order.
          </p>
        </section>

        <section>
          <h2>Sessions And Device Notifications</h2>
          <p>
            Wallet sign-in creates a secure session cookie so saved data can be
            loaded for that wallet. Enabling push notifications stores a
            browser-generated subscription for that device. The same wallet
            can link more than one device, and each linked device can receive
            enabled alerts until it is disabled or the subscription expires.
          </p>
        </section>

        <section>
          <h2>Third Parties</h2>
          <p>
            The app may interact with wallet connection services, swap routes,
            blockchain services, price data services, Telegram, email delivery,
            hosting, and monitoring tools. These services can receive basic
            request data needed to process quotes, transactions, alerts, or
            service health checks. Public wallet addresses and transaction
            details sent to blockchains or swap protocols can be visible to
            anyone.
          </p>
        </section>

        <section>
          <h2>Retention And Choices</h2>
          <p>
            Sessions, temporary sign-in requests, alerts, and operational
            records are expired or cleaned up according to service retention
            settings. You can disable notification channels, unlink push
            devices, cancel eligible limit orders, and disconnect your wallet.
            Onchain transactions and data retained by third parties may not be
            erasable.
          </p>
        </section>

        <section>
          <h2>Security</h2>
          <p>
            We use access controls, encrypted transport, restricted service
            credentials, request limits, and integrity checks. No internet or
            blockchain system can be guaranteed completely secure, so protect
            your wallet and never share a seed phrase or private key.
          </p>
        </section>
      </div>
    </main>
  );
}
